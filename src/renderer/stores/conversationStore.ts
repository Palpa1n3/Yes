import { create } from 'zustand';
import { toCommand, type CanonicalCommand, type CommandResult } from '@shared/commands';
import { pickPhrase, resolveTitle, type ConfirmMode } from '@shared/personalities';
import { findRoutine, matchRoutine } from '@shared/routines';
import {
  responseIdFor,
  type AssistantState,
  type CommandInfoShared,
  type RawIntent,
  type StoredMessage,
  type StreamChunk,
} from '@shared/types';
import { playSfx } from '@renderer/voice/sfx';
import { useAppsStore } from './appsStore';
import { useAssistantStore, type ActivityKind } from './assistantStore';
import { useSettingsStore } from './settingsStore';
import { useRoutinesStore } from './routinesStore';

export type CommandInfo = CommandInfoShared;
export type Message = StoredMessage;

interface ConversationState {
  messages: Message[];
  /** Sent texts, oldest first, for ↑/↓ recall. */
  inputHistory: string[];
  /** Response currently streaming, if any. */
  activeResponseId: string | null;
  /** Text bubble currently receiving deltas (a command card closes it). */
  activeBubbleId: string | null;
  /** Whether the active response has produced its first chunk (for latency). */
  gotFirstChunk: boolean;
  /** ms from send to first chunk of the last response. */
  lastLatencyMs: number | null;
  sentAt: number;

  send(text: string): Promise<void>;
  cancel(): void;
  clear(): void;
  pushSystem(text: string, tone?: 'info' | 'error'): void;
  pushAssistant(text: string, id?: string): void;
  markRevealed(id: string): void;
  handleChunk(chunk: StreamChunk): void;
  /** Approve / Cancel for commands awaiting confirmation. */
  approve(messageId: string): void;
  reject(messageId: string): void;
  /** Run an action the user asked for directly (a button, a routine phrase): no confirmation. */
  perform(intent: RawIntent): Promise<void>;
  /** Replace the transcript with restored history (startup). */
  restore(messages: Message[]): void;
}

const ACTIVITY_KIND: Record<CanonicalCommand['action'], ActivityKind> = {
  launch_app: 'app',
  close_app: 'app',
  open_url: 'net',
  search_web: 'net',
  system_query: 'sys',
  set_volume: 'sys',
  media_control: 'sys',
  lock_screen: 'sys',
  set_timer: 'rtn',
  cancel_timer: 'rtn',
  open_folder: 'dsk',
  find_files: 'dsk',
  reveal_file: 'dsk',
  run_routine: 'rtn',
  unknown: 'msg',
};

const VERB: Record<CanonicalCommand['action'], string> = {
  launch_app: 'Launching',
  close_app: 'Closing',
  open_url: 'Opening',
  search_web: 'Searching',
  system_query: 'Diagnostics',
  set_volume: 'Volume',
  media_control: 'Media',
  open_folder: 'Folder',
  find_files: 'Finding',
  reveal_file: 'Showing',
  set_timer: 'Timer',
  cancel_timer: 'Cancel timer',
  lock_screen: 'Locking',
  run_routine: 'Routine',
  unknown: 'Unknown',
};

const MEDIA_LABEL: Record<string, string> = {
  play_pause: 'Play / pause',
  next: 'Next track',
  previous: 'Previous track',
  stop: 'Stop',
};

const uid = (): string => crypto.randomUUID();
const now = (): number => Date.now();

/** The active personality and how it addresses you, read outside React. */
export function persona(): { phrase(list: readonly string[]): string; confirm: ConfirmMode } {
  const { personality, userName } = useSettingsStore.getState().settings;
  const title = resolveTitle(personality.userTitle, userName);
  return { phrase: (list) => pickPhrase(list, title), confirm: personality.confirmBeforeActions };
}

/** Whether a command needs Approve / Cancel first, per personality and risk. */
export function needsConfirmation(cmd: CanonicalCommand, mode: ConfirmMode): boolean {
  if (mode === 'always') return true;
  if (mode === 'never') return false;
  return cmd.risk === 'destructive';
}

/** The assistant state follows from what's in flight. `error` is set explicitly
 *  (and auto-clears in assistantStore); everything else is derived here. */
export function deriveState(
  s: Pick<ConversationState, 'messages' | 'activeResponseId'>,
): AssistantState {
  if (s.messages.some((m) => m.role === 'command' && m.command.status === 'pending'))
    return 'executing';
  const last = s.messages[s.messages.length - 1];
  if (s.activeResponseId && last?.role === 'user') return 'thinking'; // waiting for the first chunk
  const talking = s.messages.some((m) => m.role === 'assistant' && (m.streaming || !m.revealed));
  return talking ? 'speaking' : 'idle';
}

/** Verb + display target for command cards and the core's executing label. */
export function describeCommand(cmd: CanonicalCommand): { verb: string; target: string } {
  const verb = VERB[cmd.action];
  const t = cmd.target ?? '';
  const cap = (x: string): string => x.replace(/\b\w/g, (c) => c.toUpperCase());
  switch (cmd.action) {
    case 'system_query':
      return { verb, target: 'System' };
    case 'lock_screen':
      return { verb, target: 'PC' };
    case 'set_volume': {
      const mute = cmd.args?.includes('mute')
        ? 'Mute'
        : cmd.args?.includes('unmute')
          ? 'Unmute'
          : '';
      return { verb, target: [t ? `${t}%` : '', mute].filter(Boolean).join(' · ') || '—' };
    }
    case 'media_control':
      return { verb, target: MEDIA_LABEL[t] ?? t };
    case 'set_timer':
      return {
        verb,
        target: `${Number(t) < 1 ? `${Math.round(Number(t) * 60)} s` : `${+Number(t).toFixed(1)} min`}${cmd.args?.[0] ? ` · ${cmd.args[0]}` : ''}`,
      };
    case 'open_folder':
      return { verb, target: cap(t) };
    case 'run_routine': {
      const list = useRoutinesStore.getState().routines;
      return { verb, target: (list.find((r) => r.id === t) ?? findRoutine(t, list))?.name ?? t };
    }
    case 'reveal_file':
      return { verb, target: t.split(/[\\/]/).pop() || t };
    case 'launch_app':
    case 'close_app': {
      const known = useAppsStore.getState().find(t);
      return { verb, target: known?.name ?? (cap(t) || '—') };
    }
    default:
      return { verb, target: t || '—' };
  }
}

/** ARC's spoken follow-up when a command fails: what happened, then what to try next. */
export function failureLine(cmd: CanonicalCommand, reason: string): string {
  const phrase = persona().phrase(useSettingsStore.getState().settings.personality.errorPhrases);
  const target = cmd.target?.trim();
  const hint: Record<CanonicalCommand['action'], string> = {
    launch_app: target
      ? `If it's installed under another name, tell me that name, or say “search for ${target}” and I'll look it up online.`
      : 'Tell me which app you would like.',
    open_url: 'Check the address and try again.',
    search_web: 'Give it another go in a moment.',
    system_query: 'I can try the diagnostic again if you like.',
    close_app: 'If it has unsaved work, save it and try again, or close it yourself.',
    set_volume: 'You can also use the volume keys or the taskbar speaker icon.',
    media_control: 'Make sure something is playing in a media app.',
    open_folder: 'Try Documents, Downloads, Desktop, Pictures, Videos or Music.',
    find_files: 'Try fewer or different words from the file name.',
    reveal_file: 'I can only show files inside your own folders.',
    set_timer: 'Try something like “remind me in 10 minutes to stretch”.',
    cancel_timer: 'Your timers are listed in the Timers panel on the Overview.',
    lock_screen: 'You can always press Windows+L.',
    run_routine: 'Your routines are in the Routines tab, where you can check each step.',
    unknown: 'Type /help to see what I can do.',
  };
  // Terse personalities skip the coaching.
  const terse = useSettingsStore.getState().settings.personality.verbosity <= 1;
  return (terse ? `${phrase} ${reason}` : `${phrase} ${reason} ${hint[cmd.action]}`).trim();
}

export const useConversationStore = create<ConversationState>((set, get) => {
  /** Push the derived state to the core, unless an error flicker is showing. */
  const sync = (): void => {
    const a = useAssistantStore.getState();
    // `error` clears itself; `listening` lasts while push-to-talk is held.
    if (a.state === 'error' || a.state === 'listening') return;
    const next = deriveState(get());
    const pending = get().messages.find(
      (m) => m.role === 'command' && m.command.status === 'pending',
    );
    const detail =
      pending && pending.role === 'command'
        ? (({ verb, target }) => `${verb} · ${target}`)(describeCommand(pending.command.cmd))
        : undefined;
    if (a.state !== next || a.stateDetail !== detail) a.setState(next, detail);
  };

  const update = (fn: (m: Message[]) => Message[]): void => {
    set((s) => ({ messages: fn(s.messages) }));
    sync();
  };

  const setCommand = (messageId: string, patch: Partial<CommandInfo>): void =>
    update((ms) =>
      ms.map((m) =>
        m.id === messageId && m.role === 'command'
          ? { ...m, command: { ...m.command, ...patch } }
          : m,
      ),
    );

  const runCommand = async (info: CommandInfo, messageId: string): Promise<void> => {
    const { logActivity, setState } = useAssistantStore.getState();
    setCommand(messageId, { status: 'pending' });
    let result: CommandResult;
    try {
      result = await window.arc.commands.execute(info.cmd);
    } catch (err) {
      result = {
        commandId: info.cmd.id,
        status: 'failed',
        message: err instanceof Error ? err.message : 'Execution failed.',
        timestamp: now(),
      };
    }
    setCommand(messageId, { status: result.status, result });
    if (info.toolUseId && info.responseId) {
      window.arc.assistant.toolResult(info.responseId, info.toolUseId, {
        status: result.status,
        message: result.message,
      });
    }
    playSfx(result.status === 'success' ? 'success' : 'error');
    const { verb, target } = describeCommand(info.cmd);
    logActivity({
      kind: ACTIVITY_KIND[info.cmd.action],
      label: `${verb} ${target}: ${result.message}`,
      status: result.status,
    });
    if (result.status === 'success' && info.cmd.action === 'launch_app')
      useAppsStore.getState().noteLaunched(info.cmd.target ?? '');
    if (result.status === 'failed') {
      // Don't leave the user with just a red card: say what happened and what to try.
      // A real model explains failures itself; the mock needs ARC to say something.
      if (!info.toolUseId) get().pushAssistant(failureLine(info.cmd, result.message));
      setState('error');
      setTimeout(sync, 0);
    }
  };

  return {
    messages: [],
    inputHistory: [],
    activeResponseId: null,
    activeBubbleId: null,
    gotFirstChunk: false,
    lastLatencyMs: null,
    sentAt: 0,

    async send(raw) {
      const text = raw.trim();
      if (!text) return;
      const id = uid();
      const responseId = responseIdFor(id);
      set((s) => ({
        inputHistory: [...s.inputHistory.filter((h) => h !== text), text].slice(-100),
        activeResponseId: responseId,
        activeBubbleId: null,
        gotFirstChunk: false,
        sentAt: performance.now(),
        // A new message supersedes any response still streaming.
        messages: [
          ...s.messages.map((m) =>
            m.role === 'assistant' && m.streaming ? { ...m, streaming: false } : m,
          ),
          { id, role: 'user' as const, text, timestamp: now() },
        ],
      }));
      sync();
      playSfx('send');
      // A routine's name or phrase runs it right here: instant, free, no AI round trip.
      const routine = matchRoutine(text, useRoutinesStore.getState().routines);
      if (routine) {
        set({ activeResponseId: null });
        await get().perform({ action: 'run_routine', target: routine.id });
        return;
      }
      try {
        await window.arc.assistant.send({ id, text, timestamp: now() });
      } catch (err) {
        get().handleChunk({
          type: 'error',
          responseId,
          message: err instanceof Error ? err.message : 'Send failed.',
        });
      }
    },

    cancel() {
      if (!get().activeResponseId) return;
      window.arc.assistant.cancel();
    },

    clear() {
      window.arc.assistant.reset();
      window.arc.history.clear();
      set({ messages: [], activeResponseId: null, activeBubbleId: null });
      useAssistantStore.getState().setState('idle');
    },

    pushSystem(text, tone = 'info') {
      update((ms) => [...ms, { id: uid(), role: 'system', text, timestamp: now(), tone }]);
    },

    pushAssistant(text, id = uid()) {
      update((ms) => [
        ...ms,
        { id, role: 'assistant', text, timestamp: now(), streaming: false, revealed: false },
      ]);
    },

    markRevealed(id) {
      const m = get().messages.find((x) => x.id === id);
      if (!m || m.role !== 'assistant' || m.revealed) return;
      update((ms) =>
        ms.map((x) => (x.id === id && x.role === 'assistant' ? { ...x, revealed: true } : x)),
      );
    },

    approve(messageId) {
      const m = get().messages.find((x) => x.id === messageId);
      if (m?.role !== 'command' || m.command.status !== 'awaiting') return;
      void runCommand(m.command, messageId);
    },

    reject(messageId) {
      const m = get().messages.find((x) => x.id === messageId);
      if (m?.role !== 'command' || m.command.status !== 'awaiting') return;
      setCommand(messageId, { status: 'cancelled' });
      if (m.command.toolUseId && m.command.responseId) {
        window.arc.assistant.toolResult(m.command.responseId, m.command.toolUseId, {
          status: 'cancelled',
          message: 'The user cancelled this action.',
        });
      }
      const { verb, target } = describeCommand(m.command.cmd);
      useAssistantStore.getState().logActivity({
        kind: ACTIVITY_KIND[m.command.cmd.action],
        label: `${verb} ${target}: cancelled`,
        status: 'failed',
      });
    },

    async perform(intent) {
      const info: CommandInfo = { cmd: toCommand(intent, uid()), status: 'pending' };
      const mid = uid();
      update((ms) => [...ms, { id: mid, role: 'command', timestamp: now(), command: info }]);
      await runCommand(info, mid);
    },

    restore(messages) {
      set({ messages });
      sync();
    },

    handleChunk(chunk) {
      const s = get();
      // Ignore late chunks from a superseded response.
      if (chunk.responseId !== s.activeResponseId) return;
      if (!s.gotFirstChunk)
        set({ gotFirstChunk: true, lastLatencyMs: Math.round(performance.now() - s.sentAt) });

      const closeBubble = (ms: Message[]): Message[] =>
        ms.map((m) =>
          m.id === s.activeBubbleId && m.role === 'assistant' ? { ...m, streaming: false } : m,
        );

      switch (chunk.type) {
        case 'text': {
          const bubble = s.activeBubbleId;
          if (bubble) {
            update((ms) =>
              ms.map((m) =>
                m.id === bubble && m.role === 'assistant'
                  ? { ...m, text: m.text + chunk.delta }
                  : m,
              ),
            );
          } else {
            const id = uid();
            set({ activeBubbleId: id });
            update((ms) => [
              ...ms,
              {
                id,
                role: 'assistant',
                text: chunk.delta.trimStart(),
                timestamp: now(),
                streaming: true,
                revealed: false,
              },
            ]);
          }
          break;
        }
        case 'intent': {
          const cmd = toCommand(chunk.intent, uid());
          const confirm = needsConfirmation(cmd, persona().confirm);
          const info: CommandInfo = {
            cmd,
            status: confirm ? 'awaiting' : 'pending',
            // A real model waits for this action's outcome.
            ...(chunk.toolUseId
              ? { toolUseId: chunk.toolUseId, responseId: chunk.responseId }
              : {}),
          };
          const mid = uid();
          // Close the current text bubble; follow-up text opens a new one below the card.
          set({ activeBubbleId: null });
          update((ms) => [
            ...closeBubble(ms),
            { id: mid, role: 'command', timestamp: now(), command: info },
          ]);
          if (!confirm) void runCommand(info, mid);
          break;
        }
        case 'notice':
          set({ activeBubbleId: null });
          update((ms) => [
            ...closeBubble(ms),
            { id: uid(), role: 'system', text: chunk.message, timestamp: now(), tone: 'info' },
          ]);
          break;
        case 'error': {
          set({ activeResponseId: null, activeBubbleId: null });
          const lead = persona().phrase(
            useSettingsStore.getState().settings.personality.errorPhrases,
          );
          update((ms) => [
            ...closeBubble(ms),
            {
              id: uid(),
              role: 'system',
              text: `${lead} ${chunk.message}`.trim(),
              timestamp: now(),
              tone: 'error',
            },
          ]);
          useAssistantStore.getState().setState('error');
          playSfx('error');
          break;
        }
        case 'done':
          set({ activeResponseId: null, activeBubbleId: null });
          update(closeBubble);
          break;
      }
    },
  };
});

/** Subscribe the store to the main-process stream. Call once at startup. */
export function bindAssistantStream(): () => void {
  return window.arc.assistant.onStream((chunk) =>
    useConversationStore.getState().handleChunk(chunk),
  );
}

/** Persist the transcript (debounced) while history is enabled. Returns an unsubscribe. */
export function bindHistoryPersistence(): () => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  const unsub = useConversationStore.subscribe((s, prev) => {
    if (s.messages === prev.messages || !useSettingsStore.getState().settings.persistHistory)
      return;
    clearTimeout(t);
    // Don't persist the restore notice or the per-launch greeting.
    t = setTimeout(
      () => window.arc.history.save(s.messages.filter((m) => !m.id.startsWith('session-'))),
      800,
    );
  });
  return () => {
    clearTimeout(t);
    unsub();
  };
}

/** When the error flicker clears, re-derive (a command may still be pending). */
useAssistantStore.subscribe((s, prev) => {
  if (prev.state === 'error' && s.state !== 'error') {
    const next = deriveState(useConversationStore.getState());
    if (next !== s.state) s.setState(next);
  }
});
