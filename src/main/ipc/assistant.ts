import { registerPower } from './power';
import { messageBrief } from '@shared/brain';
import { factsAbout, findMentions, whosWho } from '@shared/knowledge';
import { KnowledgeService } from '../services/knowledge';
import { app, powerMonitor, safeStorage } from 'electron';
import { diagnose, parseLogLine, type Diagnosis } from '@shared/self-diagnosis';
import type { CodeFacts } from '@shared/proposals';
import { ProposalStore } from '../services/proposals';
import { DevSandbox } from '../services/dev-sandbox';
import { RegressionWatch } from '../services/regression';
import { SelfChange } from '../services/self-change';
import { bootGuard } from '../services/rollback';
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
  /** Alton's own diagnosis (log + start-up check), for diagnose_alton and improvement ideas. */
  const selfDiagnosis = (): Diagnosis => {
    const boot = app.isPackaged ? bootGuard().read() : null;
    return diagnose({
      version: app.getVersion(),
      lines: ctx.errors
        .history()
        .map(parseLogLine)
        .filter((l): l is NonNullable<typeof l> => !!l),
      ...(boot?.since ? { updatedAt: boot.since } : {}),
      health: boot?.health ? { ok: boot.health.ok, failed: boot.health.failed } : null,
    });
  };
  /** The code's shape (when the source is there), for improvement ideas. */
  const codeFacts = (): CodeFacts | null => {
    try {
      return source.analyze({ action: 'overview' }) as CodeFacts;
    } catch {
      return null;
    }
  };
  const ideas = new ProposalStore(join(userData, 'proposals.json'));
  // Alton's development copy of its own project (never the real folder).
  const sandbox = new DevSandbox({
    root: join(userData, 'dev-sandbox'),
    projectDir: () => getSettings().projectDir || getSettings().sourceDir,
    approve: (title, detail) => ctx.askApproval?.(title, detail) ?? Promise.resolve(false),
  });
  app.on('will-quit', () => void sandbox.discard());
  // Changes from the development copy reach the real project only with the user's approval.
  const selfChange = new SelfChange({
    sandbox,
    projectDir: () => getSettings().projectDir || getSettings().sourceDir,
    approve: (title, detail) => ctx.askApproval?.(title, detail) ?? Promise.resolve(false),
    audit: (text, ok) => ctx.audit.add('action', text, ok),
  });
  // Daily self-test of the project's last commit, in its own copy (regressions get reported,
  // and the log entry feeds the diagnosis and improvement ideas).
  const regression = new RegressionWatch({
    file: join(userData, 'regression.json'),
    sandbox: () =>
      new DevSandbox({
        root: join(userData, 'dev-sandbox-selftest'),
        projectDir: () => getSettings().projectDir || getSettings().sourceDir,
        approve: async () => false, // never needed: only committed code runs here
      }),
  });
  const selfTestResult = (text: string, broke: boolean): void => {
    ctx.audit.add('action', text, !broke);
    if (broke) {
      ctx.errors.add('error', 'regression', text);
      ctx.notify(text);
    } else ctx.errors.add('info', 'selftest', text);
  };
  const dailySelfTest = (): void => {
    const s = getSettings();
    if (!(s.projectDir || s.sourceDir) || !regression.due()) return;
    // Only while the PC is idle (10 minutes without input), so it never slows anything down.
    if (powerMonitor.getSystemIdleTime() < 600) return;
    void regression
      .tool({ action: 'run' }, selfTestResult)
      .catch((err: unknown) =>
        ctx.errors.add('warn', 'selftest', `Self-test failed: ${String(err)}`),
      );
  };
  setInterval(dailySelfTest, 30 * 60_000).unref?.();
  // Learn lasting facts from chats once they go quiet (Claude only, can be switched off).
  const learner = new MemoryLearner({
    client: async () => {
      const key = await secrets.get();
      return key ? new Anthropic({ apiKey: key, maxRetries: 1 }) : null;
    },
    enabled: () =>
      getSettings().autoMemory && getSettings().provider === 'anthropic' && !getSettings().saver,
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
  // Who and what the user has mentioned, and how they connect (rebuilt when memories change).
  const knowledge = new KnowledgeService({
    file: join(userData, 'knowledge.json'),
    client: async () => {
      const key = await secrets.get();
      return key ? new Anthropic({ apiKey: key, maxRetries: 1 }) : null;
    },
    memories: () => extra.notes.memoryTexts(),
    blocked: () =>
      getSettings().provider !== 'anthropic' || getSettings().saver
        ? 'Needs Claude (and Saver mode off).'
        : ctx.usage.blocked('memory'),
    onUsage: (model, usage) => void ctx.usage.record(model, usage, 'memory'),
    log: (m) => ctx.errors.add('info', 'knowledge', m),
  });
  setTimeout(() => void knowledge.rebuild(), 3 * 60_000).unref?.();
  setInterval(() => void knowledge.rebuild(), 3 * 3600_000).unref?.();
  // Once a day: merge memories that say the same thing and retire ones about a day that has
  // passed (archived; undo in Notes › Memory).
  const tidy = (): void => {
    const r = extra.notes.tidyMemories();
    if (r.stopped) {
      ctx.audit.add('memory', r.stopped);
      ctx.notify(r.stopped);
    } else if (r.merged || r.outOfDate)
      ctx.audit.add(
        'memory',
        `Tidied memories: merged ${r.merged}, retired ${r.outOfDate} out of date (undo in Notes › Memory)`,
      );
  };
  setTimeout(tidy, 2 * 60_000).unref?.();
  setInterval(tidy, 24 * 3600_000).unref?.();
  // Once a week: Alton looks at its own log and code and notes ideas to improve itself
  // (suggestions only; nothing changes without the user).
  const weeklyIdeas = (): void => {
    if (!ideas.due()) return;
    try {
      const fresh = ideas.refresh(selfDiagnosis(), codeFacts());
      if (fresh.length) {
        const text = `${getSettings().assistantName} has ${fresh.length} new idea${fresh.length === 1 ? '' : 's'} to improve itself. Ask “what would you improve?” to see ${fresh.length === 1 ? 'it' : 'them'}.`;
        ctx.audit.add('memory', text);
        ctx.notify(text);
      }
    } catch (err) {
      ctx.errors.add('warn', 'ideas', `Improvement ideas failed: ${String(err)}`);
    }
  };
  setTimeout(weeklyIdeas, 15 * 60_000).unref?.();
  setInterval(weeklyIdeas, 24 * 3600_000).unref?.();
  // Memory learning is background work: paused at the monthly limit (Settings › AI › Spending).
  extra.chats.onSaved = (id) => {
    if (!ctx.usage.blocked('memory')) learner.schedule(id);
  };
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
      // Saver mode: the cheapest model for everything but Agent Mode.
      model: () => (getSettings().saver ? 'claude-haiku-5-5' : getSettings().model),
      // The central engine: which model answers this message, and what to know for it.
      brief: (text, attachments) => {
        const s = getSettings();
        return messageBrief({
          text,
          attachments,
          model: { chosen: s.model, auto: s.autoModel, top: s.autoModelTop, saver: s.saver },
          graph: knowledge.get(),
        });
      },
      researchModel: () => (getSettings().saver ? 'claude-haiku-5-5' : getSettings().researchModel),
      saver: () => getSettings().saver,
      accent: () => getSettings().accent,
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
      // What's going on now, plus who's who from the knowledge graph.
      context: () => [extra.context?.() ?? '', whosWho(knowledge.get())].filter(Boolean).join(' '),
      onUsage: (model, usage, feature) => void ctx.usage.record(model, usage, feature),
      onInjection: (tool, flags) => {
        const text = `Safety check: content from ${tool} looked like instructions to an AI (${flags.join('; ')}); Alton was told not to act on it.`;
        ctx.audit.add('action', text, false);
        ctx.errors.add('warn', 'safety', text);
      },
      // Risky tools after outside content: the user's Approve / Deny card (enforced here, in main).
      approve: (title, detail) => ctx.askApproval?.(title, detail) ?? Promise.resolve(false),
      extra: {
        look_up: (input) => {
          const q = String((input as { name?: unknown } | null)?.name ?? '').slice(0, 80);
          const g = knowledge.get();
          const hits = findMentions(g, q);
          return hits.length
            ? { facts: hits.slice(0, 3).flatMap((e) => factsAbout(g, e.id)) }
            : { found: `Nothing known about “${q}” yet.` };
        },
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
        analyze_arc_code: (input) => source.analyze(input),
        diagnose_alton: () => selfDiagnosis(),
        dev_sandbox: (input) => sandbox.tool(input, () => regression.last()),
        self_test: (input) => regression.tool(input, selfTestResult),
        apply_self_change: (input) => selfChange.tool(input),
        improvement_ideas: (input) =>
          ideas.tool(input, () => ({ diagnosis: selfDiagnosis(), code: codeFacts() })),
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

    // At the monthly limit with "pause everything": no Claude (the offline model if there is one).
    const paused = provider === chat.claude ? ctx.usage.blocked('chat') : null;
    if (paused) {
      provider = local ?? mock;
      out({
        type: 'notice',
        responseId,
        message: local ? `${paused} Using the offline model instead.` : paused,
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
