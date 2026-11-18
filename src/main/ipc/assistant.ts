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
import { MockProvider, type AIProvider } from '../services/ai-provider';
import { AnthropicProvider, OfflineError } from '../services/anthropic-provider';
import { AppRegistry } from '../services/app-registry';
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
    calendar(): CalEvent[] | null;
  },
): void {
  const getWeather = extra.weather;
  const getWindow = ctx.getWindow;
  const getStats = (): SystemStats => ctx.telemetry.snapshot();
  const getSettings = (): Settings => ctx.settings.get();
  const userData = app.getPath('userData');
  const secrets = new SecretStore(join(userData, 'anthropic-key.bin'), safeStorage);
  const registry = new AppRegistry(join(userData, 'apps.json'));
  const systemPrompt = (): string => {
    const s = getSettings();
    return buildSystemPrompt({ ...s.personality, assistantName: s.assistantName }, s.userName);
  };

  const mock: AIProvider = new MockProvider(
    getStats,
    () => {
      const s = getSettings();
      return { personality: s.personality, userName: s.userName };
    },
    getWeather,
    extra.calendar,
  );
  const claude = new AnthropicProvider({
    getKey: () => secrets.get(),
    model: () => getSettings().model,
    systemPrompt,
    info,
    stats: getStats,
    detailedStats: () => ctx.telemetry.snapshotWithProcesses(),
    warm: () => ctx.telemetry.warmProcesses(),
    timers: () => ctx.timers.list(),
    weather: getWeather,
    routines: extra.routines,
    calendar: extra.calendar,
    apps: () => registry.load().map((a) => ({ name: a.name, intents: a.intents })),
  });

  let history: ChatMessage[] = [];
  let inflight: AbortController | null = null;
  /** Actions the model is waiting on, keyed `${responseId}:${toolUseId}`. */
  const waiting = new Map<string, (o: ToolOutcome) => void>();

  handle(IPC.assistant.send, async (msg) => {
    inflight?.abort(); // a new message supersedes the old one
    const ctrl = new AbortController();
    inflight = ctrl;
    const responseId = responseIdFor(msg.id);
    history = [...history, { role: 'user' as const, content: msg.text }].slice(-MAX_HISTORY);
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
    let provider = mock;
    if (s.provider === 'anthropic') {
      if (secrets.has()) provider = claude;
      else
        out({
          type: 'notice',
          responseId,
          message:
            'No Anthropic API key saved, so I am using the offline mock. Add a key in Settings › Advanced.',
        });
    }

    let text = '';
    const run = async (p: AIProvider): Promise<void> => {
      for await (const chunk of p.send(history, {
        systemPrompt: systemPrompt(),
        signal: ctrl.signal,
        runTool,
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
        // Offline before anything was said: answer with the mock instead of failing.
        out({
          type: 'notice',
          responseId,
          message: `${err.message} Using the offline mock for now.`,
        });
        try {
          await run(mock);
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
      history = [...history, { role: 'assistant' as const, content: text }].slice(-MAX_HISTORY);
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
  on(
    IPC.assistant.reset,
    () => {
      inflight?.abort();
      history = [];
      claude.reset();
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
