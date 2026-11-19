import { registerPower } from './power';
import { app, safeStorage } from 'electron';
import { join } from 'node:path';
import { IPC } from '@shared/ipc';
import { buildSystemPrompt } from '@shared/personalities';
import {
  responseIdFor,
  type ChatMessage,
  type Settings,
  type SystemStats,
  type ToolOutcome,
} from '@shared/types';
import type { Routine } from '@shared/routines';
import type { CalEvent } from '@shared/calendar';
import type { WeatherData } from '@shared/weather';
import type { MainContext } from '../context';
import type { ChatStore } from '../services/chat-store';
import type { NotesStore } from '../services/notes-store';
import type { NowPlaying } from '@shared/media';
import type { ScreenWatch } from '../services/screen-watch';
import type { EmailService } from '../services/email';
import { MAX_ATTACHMENTS } from '@shared/attachments';
import { MockProvider, type AIProvider } from '../services/ai-provider';
import { AnthropicProvider, OfflineError, localTimeText } from '../services/anthropic-provider';
import { OllamaProvider, localModels } from '../services/ollama-provider';
import { AppRegistry } from '../services/app-registry';
import Anthropic from '@anthropic-ai/sdk';
import { SourceReader } from '../services/diagnostics';
import { MemoryLearner } from '../services/memory-learner';
import { Plugins } from '../services/plugins';
import { recentCrashes } from '../services/crash-reports';
import { registerGames } from './games';
import { registerToolbox } from './toolbox';
import { grabAll } from './screen';
import { sessionLine } from '../services/gaming-sessions';
import { SecretStore } from '../services/secret-store';
import { info } from '../services/system-stats';
import { emit, handle, on } from './handle';

const MAX_HISTORY = 40;
/** How long an action card may wait for Approve / Cancel before the model is told it timed out. */
const TOOL_TIMEOUT_MS = 10 * 60_000;

export function registerAssistantIpc(
  ctx: MainContext,
  extra: {
    weather(): WeatherData | null;
    routines(): Routine[];
    /** Create or replace (by name) a routine Claude wrote. */
    saveRoutine(input: unknown): unknown;
    calendar(): CalEvent[] | null;
    chats: ChatStore;
    notes: NotesStore;
    awarenessTools: Record<string, (input: unknown) => unknown>;
    /** What the user is doing right now (for each Claude turn). */
    context(): string;
    nowPlaying(): NowPlaying | null;
    screen: ScreenWatch;
    clipboard(query?: string): Array<{ copied: string; text: string }>;
    email: EmailService;
  },
): void {
  const getWeather = extra.weather;
  const getWindow = ctx.getWindow;
  const getStats = (): SystemStats => ctx.telemetry.snapshot();
  const getSettings = (): Settings => ctx.settings.get();
  const userData = app.getPath('userData');
  const secrets = new SecretStore(join(userData, 'anthropic-key.bin'), safeStorage);
  const registry = new AppRegistry(join(userData, 'apps.json'));
  const games = registerGames(ctx);
  const power = registerPower(ctx);
  ctx.power = power;
  const toolbox = registerToolbox(ctx, { notes: extra.notes, anthropicKey: () => secrets.get() });
  // Its own code: the folder chosen in Settings (your latest edits), else the copy of the
  // source shipped inside the app (resources/source), or the project itself when developing.
  const bundledSource = app.isPackaged ? join(process.resourcesPath, 'source') : app.getAppPath();
  const source = new SourceReader(() => getSettings().sourceDir || bundledSource);
  // Learn lasting facts from chats once they go quiet (Claude only, can be switched off).
  const learner = new MemoryLearner({
    client: async () => {
      const key = await secrets.get();
      return key ? new Anthropic({ apiKey: key, maxRetries: 1 }) : null;
    },
    enabled: () => getSettings().autoMemory && getSettings().provider === 'anthropic',
    memories: () => extra.notes.memoryTexts(),
    remember: (f, category) => {
      extra.notes.remember(f, true, category);
      ctx.audit.add('memory', `Learned: ${f}`);
    },
    messages: (id) => extra.chats.messages(id),
    file: join(userData, 'memory-learned.json'),
    log: (m) => ctx.errors.add('info', 'memory', m),
    onUsage: (model, usage) => void ctx.usage.record(model, usage, 'memory'),
  });
  extra.chats.onSaved = (id) => learner.schedule(id);
  app.on('will-quit', () => learner.stop());
  const plugins = new Plugins(join(userData, 'plugins'));
  const systemPrompt = (): string => {
    const s = getSettings();
    const base = buildSystemPrompt(
      { ...s.personality, assistantName: s.assistantName },
      s.userName,
    );
    const extraRules = plugins.instructions();
    return extraRules ? `${base}\n\n${extraRules}` : base;
  };
  const importPluginRoutines = (): ReturnType<Plugins['list']> => {
    const list = plugins.list();
    // Routines that come with plugins are added once (by name).
    for (const p of list)
      for (const r of p.routines) {
        const name = String((r as { name?: unknown } | null)?.name ?? '');
        if (name && !extra.routines().some((x) => x.name.toLowerCase() === name.toLowerCase()))
          extra.saveRoutine(r);
      }
    return list;
  };
  setTimeout(() => {
    try {
      importPluginRoutines();
    } catch {
      /* a broken plugin file must not stop startup */
    }
  }, 5000);
  handle(IPC.app.plugins, () => {
    plugins.ensureFolder();
    const list = importPluginRoutines();
    return list.map((p) => ({
      file: p.file,
      name: p.name,
      description: p.description,
      routines: p.routines.length,
      error: p.error ?? null,
    }));
  });

  const mock: AIProvider = new MockProvider(
    getStats,
    () => {
      const s = getSettings();
      return { personality: s.personality, userName: s.userName };
    },
    getWeather,
    extra.calendar,
    { tool: (n, i) => extra.notes.tool(n, i), memories: () => extra.notes.memoryTexts() },
    extra.nowPlaying,
    extra.clipboard,
    () => extra.email.get(),
  );
  const makeClaude = (): AnthropicProvider =>
    new AnthropicProvider({
      getKey: () => secrets.get(),
      model: () => getSettings().model,
      researchModel: () => getSettings().researchModel,
      systemPrompt,
      info,
      stats: getStats,
      detailedStats: () => ctx.telemetry.snapshotWithProcesses(),
      warm: () => ctx.telemetry.warmProcesses(),
      timers: () => ctx.timers.list(),
      weather: getWeather,
      routines: extra.routines,
      calendar: extra.calendar,
      notes: extra.notes,
      memories: () => {
        const rota = ctx.shifts.summary();
        return rota ? [...extra.notes.memoryTexts(), rota] : extra.notes.memoryTexts();
      },
      nowPlaying: extra.nowPlaying,
      screenshot: () => extra.screen.forModel(),
      clipboard: extra.clipboard,
      email: extra.email,
      apps: () => registry.load().map((a) => ({ name: a.name, intents: a.intents })),
      context: extra.context,
      onUsage: (model, usage, feature) => void ctx.usage.record(model, usage, feature),
      extra: {
        search_past_chats: (input) => {
          const q = String((input as { query?: unknown } | null)?.query ?? '').slice(0, 200);
          const found = extra.chats.excerpts(q);
          return found.length ? found : { found: 'Nothing in earlier chats matches that.' };
        },
        read_arc_logs: (input) => {
          const n = Number((input as { lines?: unknown } | null)?.lines) || 80;
          const lines = ctx.errors.tail(n);
          return lines.length
            ? lines.join('\n')
            : 'The log is empty: no errors or warnings since ARC started.';
        },
        read_arc_source: (input) => source.tool(input),
        get_recent_crashes: (input) => recentCrashes(input),
        ...games.tools,
        ...power.tools,
        ...extra.awarenessTools,
        ...toolbox,
        look_at_all_screens: async () => {
          if (!getSettings().screenAware)
            return { error: 'Screen awareness is off (Settings › Privacy).' };
          const shots = await grabAll();
          return shots.length ? { images: shots } : { error: 'Could not capture the screens.' };
        },
        get_gaming_sessions: () => {
          const list = ctx.gamingSessions?.() ?? [];
          return list.length
            ? list.slice(0, 10).map((g) => ({
                ...g,
                start: new Date(g.start).toLocaleString(),
                summary: sessionLine(g),
              }))
            : {
                sessions: [],
                note: 'No gaming sessions recorded yet (they are recorded while gaming mode is on).',
              };
        },
        create_routine: (input) => extra.saveRoutine(input),
      },
    });

  /** Offline AI through Ollama (Settings › AI › Local AI). */
  const ollama = new OllamaProvider({
    model: () => getSettings().localModel,
    context: () => {
      const mem = extra.notes.memoryTexts();
      return `It is ${localTimeText()}.${mem.length ? `\nWhat you know about the user:\n${mem.map((m) => `- ${m}`).join('\n')}` : ''}`;
    },
  });
  handle(IPC.ai.localModels, async () => localModels());
  handle(IPC.ai.usage, () => ctx.usage.summary());

  /** The key-test and per-chat Claude conversations (each keeps its own context). */
  const claude = makeClaude();
  const perChat = new Map<string, { claude: AnthropicProvider; history: ChatMessage[] }>();
  const chatState = (chatId: string): { claude: AnthropicProvider; history: ChatMessage[] } => {
    let st = perChat.get(chatId);
    if (!st) {
      // A chat from before a restart: give Claude its earlier turns as plain text.
      const earlier = extra.chats
        .messages(chatId)
        .flatMap((m) =>
          m.role === 'user' || m.role === 'assistant' ? [{ role: m.role, content: m.text }] : [],
        );
      st = { claude: makeClaude(), history: earlier.slice(-MAX_HISTORY) };
      st.claude.seed(earlier);
      perChat.set(chatId, st);
    }
    return st;
  };
  let inflight: AbortController | null = null;
  /** Actions the model is waiting on, keyed `${responseId}:${toolUseId}`. */
  const waiting = new Map<string, (o: ToolOutcome) => void>();

  handle(IPC.assistant.send, async (msg) => {
    inflight?.abort(); // a new message supersedes the old one
    const ctrl = new AbortController();
    inflight = ctrl;
    const responseId = responseIdFor(msg.id);
    const chatId = typeof msg.chatId === 'string' ? msg.chatId : extra.chats.state().activeId;
    const chat = chatState(chatId);
    const research = extra.chats.get(chatId)?.research === true;
    // Only well-formed attachments, within limits (the renderer already shrank pictures).
    const attachments = (Array.isArray(msg.attachments) ? msg.attachments : [])
      .filter(
        (a) =>
          a &&
          typeof a.data === 'string' &&
          typeof a.name === 'string' &&
          (a.kind === 'image' || a.kind === 'pdf' || a.kind === 'text') &&
          a.data.length < 30 * 1024 * 1024,
      )
      .slice(0, MAX_ATTACHMENTS);
    chat.history = [...chat.history, { role: 'user' as const, content: msg.text }].slice(
      -MAX_HISTORY,
    );
    const out = (chunk: Parameters<typeof emit<typeof IPC.assistant.onStream>>[2]): void =>
      emit(getWindow(), IPC.assistant.onStream, chunk);

    const runTool = (toolUseId: string): Promise<ToolOutcome> =>
      new Promise((resolve) => {
        const key = `${responseId}:${toolUseId}`;
        const finish = (o: ToolOutcome): void => {
          clearTimeout(timer);
          waiting.delete(key);
          resolve(o);
        };
        const timer = setTimeout(
          () => finish({ status: 'cancelled', message: 'No response from the user in time.' }),
          TOOL_TIMEOUT_MS,
        );
        ctrl.signal.addEventListener(
          'abort',
          () => finish({ status: 'cancelled', message: 'The user moved on.' }),
          { once: true },
        );
        waiting.set(key, finish);
      });

    const s = getSettings();
    const local = s.localModel ? ollama : null;
    let provider: AIProvider = local ?? mock;
    if (s.provider === 'anthropic') {
      if (secrets.has()) provider = chat.claude;
      else
        out({
          type: 'notice',
          responseId,
          message:
            'No Anthropic API key saved, so I am using the offline mock. Add a key in Settings › AI.',
        });
    }

    let text = '';
    const run = async (p: AIProvider): Promise<void> => {
      for await (const chunk of p.send(chat.history, {
        systemPrompt: systemPrompt(),
        signal: ctrl.signal,
        runTool,
        research,
        ...(attachments.length ? { attachments } : {}),
      })) {
        if (ctrl.signal.aborted) break;
        if (chunk.type === 'text') text += chunk.delta;
        out({ ...chunk, responseId });
      }
    };

    try {
      await run(provider);
    } catch (err) {
      if (err instanceof OfflineError && !text) {
        // Offline before anything was said: the local AI if there is one, else the mock.
        const fallback = local && provider !== local ? local : mock;
        out({
          type: 'notice',
          responseId,
          message: `${err.message} Using the ${fallback === mock ? 'offline mock' : 'local AI'} for now.`,
        });
        try {
          await run(fallback).catch(async (e: unknown) => {
            if (fallback !== mock && e instanceof OfflineError && !text) await run(mock);
            else throw e;
          });
        } catch (e) {
          out({
            type: 'error',
            responseId,
            message: e instanceof Error ? e.message : 'The mock failed.',
          });
        }
      } else if (!ctrl.signal.aborted) {
        out({
          type: 'error',
          responseId,
          message: err instanceof Error ? err.message : 'The provider failed.',
        });
      }
    } finally {
      if (inflight === ctrl) inflight = null;
    }
    // A cancelled response still closes its stream so the renderer can settle.
    if (ctrl.signal.aborted) out({ type: 'done', responseId });
    if (text)
      chat.history = [...chat.history, { role: 'assistant' as const, content: text }].slice(
        -MAX_HISTORY,
      );
    return { id: responseId, text, timestamp: Date.now() };
  });

  on(
    IPC.assistant.toolResult,
    (_w, responseId, toolUseId, outcome) => {
      const ok =
        outcome &&
        ['success', 'failed', 'cancelled'].includes(outcome.status) &&
        typeof outcome.message === 'string';
      if (ok)
        waiting.get(`${responseId}:${toolUseId}`)?.({
          status: outcome.status,
          message: outcome.message.slice(0, 2000),
        });
    },
    getWindow,
  );
  on(IPC.assistant.cancel, () => inflight?.abort(), getWindow);
  // Regenerate / edit: Claude's context is rebuilt from the saved chat on the next message.
  on(IPC.assistant.rewind, (_w, id) => perChat.delete(String(id).slice(0, 40)), getWindow);
  on(
    IPC.assistant.reset,
    () => {
      inflight?.abort();
      // "Clear" in the current chat: forget its context too.
      perChat.delete(extra.chats.state().activeId);
    },
    getWindow,
  );

  /* ── API key ── */
  const status = async () => ({
    hasKey: secrets.has(),
    encryptionAvailable: await secrets.encryptionAvailable(),
  });
  handle(IPC.ai.status, status);
  handle(IPC.ai.setKey, async (raw) => {
    const key = typeof raw === 'string' ? raw.trim() : '';
    if (!/^sk-ant-[\w-]{20,}$/.test(key))
      return {
        ok: false,
        message: "That doesn't look like an Anthropic API key (it should start with sk-ant-).",
      };
    const test = await claude.test(key);
    if (!test.ok) return test; // never store a key that doesn't work
    try {
      await secrets.set(key);
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Could not save the key.' };
    }
    return { ok: true, message: `${test.message} Key saved, encrypted on this PC.` };
  });
  handle(IPC.ai.clearKey, async () => {
    secrets.clear();
    return status();
  });
  handle(IPC.ai.test, () => claude.test());
}
