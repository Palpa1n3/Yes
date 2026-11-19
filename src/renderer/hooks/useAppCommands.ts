import type { Source } from '@shared/chats';
import { emergencyStop } from '@renderer/emergency';
import { useEffect } from 'react';
import { saveNow, useConversationStore } from '@renderer/stores/conversationStore';
import { useUiStore } from '@renderer/stores/uiStore';
import { toggleListening } from '@renderer/voice/useSpeechInput';
import { toggleOpenMic } from '@renderer/voice/useWakeWord';

export const FOCUS_INPUT_EVENT = 'arc:focus-input';

/** Handles requests from the main process (global hotkey, tray menu). */
export function useAppCommands(compact: boolean): void {
  useEffect(
    () =>
      window.arc.app.onCommand((c) => {
        switch (c.type) {
          case 'focus-input':
            // The console lives on Overview; the compact pill always has its own input.
            if (!compact) useUiStore.getState().setTab('overview');
            requestAnimationFrame(() => window.dispatchEvent(new Event(FOCUS_INPUT_EVENT)));
            break;
          case 'open-settings':
            useUiStore.getState().openSettings();
            break;
          case 'run-routine':
            void useConversationStore.getState().perform({ action: 'run_routine', target: c.id });
            break;
          case 'remote-message':
            void replyToPhone(c.id, c.text, c.chatId, c.images);
            break;
          case 'remote-cancel':
            useConversationStore.getState().cancel();
            break;
          case 'emergency-stop':
            emergencyStop();
            useConversationStore.getState().cancel();
            useConversationStore.getState().pushSystem('Emergency stop: everything stopped.');
            break;
          case 'open-mic-toggle':
            toggleOpenMic();
            break;
          case 'voice-toggle':
            toggleListening();
            break;
          case 'notice':
            useConversationStore.getState().pushSystem(c.text);
            break;
          case 'journey-map':
            useConversationStore.getState().pushMap(c.map);
            break;
          case 'screensaver':
            window.dispatchEvent(new CustomEvent('arc:screensaver', { detail: c.on }));
            break;
          case 'clipboard-actions': {
            // Only the Overview and Chat tabs have a command line.
            const ui = useUiStore.getState();
            const here = ui.tab === 'overview' || ui.tab === 'chat';
            if (!here) ui.setTab('chat');
            setTimeout(
              () => window.dispatchEvent(new CustomEvent('arc:clip-actions', { detail: c.text })),
              here ? 0 : 120,
            );
            break;
          }
        }
      }),
    [compact],
  );
}

/** A message from the phone app: answered in the chat the phone has open (the PC switches
 *  to it), and the reply streams back to the phone as it is written. */
async function replyToPhone(
  id: string,
  text: string,
  chatId?: string,
  images: Array<{ name: string; data: string; thumb: string }> = [],
): Promise<void> {
  const conv = useConversationStore;
  try {
    if (chatId && conv.getState().chatId !== chatId) await conv.getState().openChat(chatId);
    const before = conv.getState().messages.length;
    const collect = (): { text: string; sources: Source[] } => {
      const after = conv.getState().messages.slice(before);
      const sources: Source[] = [];
      const parts = after.flatMap((m) => {
        if (m.role === 'assistant') {
          sources.push(...(m.sources ?? []));
          return [m.text];
        }
        if (m.role === 'system') return [`_${m.text}_`];
        if (m.role === 'command')
          return [
            `> ${m.command.cmd.action.replace(/_/g, ' ')}${m.command.cmd.target ? `: ${m.command.cmd.target}` : ''} · ${m.command.status === 'awaiting' ? 'waiting for approval (on the PC or the Phone tab)' : (m.command.result?.message ?? m.command.status)}`,
          ];
        return [];
      });
      return { text: parts.filter(Boolean).join('\n\n'), sources };
    };
    let last = 0;
    const push = (done: boolean): void => {
      const { text: t, sources } = collect();
      window.arc.remote.progress(id, {
        text: t,
        activity: conv.getState().activity ?? '',
        done,
        ...(sources.length ? { sources } : {}),
      });
    };
    const unsub = conv.subscribe(() => {
      if (performance.now() - last < 250) return;
      last = performance.now();
      push(false);
    });
    const prepared = images.map((i) => ({
      att: {
        name: i.name,
        kind: 'image' as const,
        mime: 'image/jpeg',
        data: i.data,
        size: Math.round((i.data.length * 3) / 4),
      },
      info: {
        name: i.name,
        kind: 'image' as const,
        size: Math.round((i.data.length * 3) / 4),
        ...(i.thumb ? { thumb: i.thumb } : {}),
      },
    }));
    await conv.getState().send(text, prepared);
    // Wait for a streamed reply to finish (approvals can hold it for a while).
    for (let i = 0; i < 1500 && conv.getState().activeResponseId; i++)
      await new Promise((r) => setTimeout(r, 200));
    unsub();
    // Save now so the phone sees the finished chat when it reloads it.
    const st = conv.getState();
    if (st.chatId) saveNow(st.chatId, st.messages);
    push(true);
    const final = collect().text;
    window.arc.remote.reply(id, final || 'Done.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Something went wrong.';
    window.arc.remote.progress(id, { text: '', activity: '', done: true, error: msg });
    window.arc.remote.reply(id, msg);
  }
}
