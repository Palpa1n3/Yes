import type { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import { buildSystemPrompt } from '@shared/personalities';
import { responseIdFor, type ChatMessage, type Settings, type SystemStats } from '@shared/types';
import { MockProvider, type AIProvider } from '../services/ai-provider';
import { emit, handle, on } from './handle';

const MAX_HISTORY = 40;

export function registerAssistantIpc(
  getWindow: () => BrowserWindow | null,
  getStats: () => SystemStats,
  getSettings: () => Settings,
): void {
  const provider: AIProvider = new MockProvider(getStats, () => {
    const s = getSettings();
    return { personality: s.personality, userName: s.userName };
  });
  let history: ChatMessage[] = [];
  let inflight: AbortController | null = null;

  handle(IPC.assistant.send, async (msg) => {
    inflight?.abort(); // a new message supersedes the old one
    const ctrl = new AbortController();
    inflight = ctrl;
    const responseId = responseIdFor(msg.id);
    history = [...history, { role: 'user' as const, content: msg.text }].slice(-MAX_HISTORY);

    let text = '';
    try {
      for await (const chunk of provider.send(history, {
        systemPrompt: (() => {
          const s = getSettings();
          return buildSystemPrompt(
            { ...s.personality, assistantName: s.assistantName },
            s.userName,
          );
        })(),
        signal: ctrl.signal,
      })) {
        if (ctrl.signal.aborted) break;
        if (chunk.type === 'text') text += chunk.delta;
        emit(getWindow(), IPC.assistant.onStream, { ...chunk, responseId });
      }
    } catch (err) {
      emit(getWindow(), IPC.assistant.onStream, {
        type: 'error',
        responseId,
        message: err instanceof Error ? err.message : 'The provider failed.',
      });
    } finally {
      if (inflight === ctrl) inflight = null;
    }
    // A cancelled response still closes its stream so the renderer can settle.
    if (ctrl.signal.aborted)
      emit(getWindow(), IPC.assistant.onStream, { type: 'done', responseId });
    if (text)
      history = [...history, { role: 'assistant' as const, content: text }].slice(-MAX_HISTORY);
    return { id: responseId, text, timestamp: Date.now() };
  });

  on(IPC.assistant.cancel, () => inflight?.abort(), getWindow);
  on(
    IPC.assistant.reset,
    () => {
      inflight?.abort();
      history = [];
    },
    getWindow,
  );
}
