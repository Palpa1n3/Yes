/** Claude via the Anthropic Messages API, with ARC's actions as tools.
 *  ARC runs the loop itself so each action passes through the renderer's command cards
 *  (Approve / Cancel, activity log) before its result goes back to the model. */
import { describeSchedule, describeStep, type Routine } from '@shared/routines';
import { weatherSummary, type WeatherData } from '@shared/weather';
import Anthropic from '@anthropic-ai/sdk';
import type {
  AiModel,
  ProviderChunk,
  RawIntent,
  SystemInfo,
  SystemStats,
  ToolOutcome,
  TimerInfo,
} from '@shared/types';
import type { AIProvider, SendOptions } from './ai-provider';

type Msg = Anthropic.Beta.BetaMessageParam;
type ToolResult = Anthropic.Beta.BetaToolResultBlockParam;

/** Most model steps (tool calls) in one reply, so a confused turn can't run up a bill. */
export const MAX_STEPS = 8;
/** Start a fresh model context after this many messages (each restart is announced). */
export const MAX_TRANSCRIPT = 300;

export const MODEL_LABEL: Record<AiModel, string> = {
  'claude-haiku-5-5': 'Haiku 5.5',
  'claude-sonnet-5-5': 'Sonnet 5.5',
  'claude-opus-5-5': 'Opus 5.5',
};

/** Thrown when the network is unreachable, so the caller can fall back to the mock. */
export class OfflineError extends Error {}

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'launch_app',
    description:
      "Open an application on the user's computer. Pass the app's name or a phrase from the user's app list (e.g. 'spotify', 'vs code', 'play music'). Call list_apps first if unsure of the name.",
    input_schema: {
      type: 'object',
      properties: { app: { type: 'string', description: 'App name or alias' } },
      required: ['app'],
      additionalProperties: false,
    },
  },
  {
    name: 'open_url',
    description: 'Open a web page in the default browser. Only http(s) addresses.',
    input_schema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_web',
    description:
      "Search the web in the user's default browser and show them the results page. Use when they ask to look something up online.",
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_system_status',
    description:
      'Read live system telemetry: CPU, memory, GPU, temperatures, disks, network, uptime, and (when available) top processes.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_apps',
    description: "List the apps in the user's app registry with the phrases that open them.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'close_app',
    description:
      'Politely ask a running app to close (like clicking its X), so it can still ask to save. The user is asked to approve first. Use the app name as the user would say it or as shown in get_system_status topProcesses (e.g. "opera", "spotify").',
    input_schema: {
      type: 'object',
      properties: { app: { type: 'string' } },
      required: ['app'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_volume',
    description:
      'Set the system output volume (0-100) and/or mute or unmute it. Give at least one of level or mute.',
    input_schema: {
      type: 'object',
      properties: {
        level: { type: 'integer', minimum: 0, maximum: 100 },
        mute: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'media_control',
    description: 'Press a media key for whatever is playing (Spotify, a browser video, etc.).',
    input_schema: {
      type: 'object',
      properties: { action: { type: 'string', enum: ['play_pause', 'next', 'previous', 'stop'] } },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'open_folder',
    description: "Open one of the user's folders in File Explorer.",
    input_schema: {
      type: 'object',
      properties: {
        folder: {
          type: 'string',
          enum: ['documents', 'downloads', 'desktop', 'pictures', 'videos', 'music'],
        },
      },
      required: ['folder'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_files',
    description:
      "Search file names in the user's Documents, Downloads, Desktop, Pictures, Videos and Music (newest first, up to 15). Use short distinctive words from the file name.",
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'reveal_file',
    description:
      'Show a file (by full path, e.g. from find_files) selected in File Explorer. It does not open or run the file.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_timer',
    description:
      'Set a timer or reminder. When it ends the user gets a Windows notification with the label.',
    input_schema: {
      type: 'object',
      properties: {
        minutes: { type: 'number', exclusiveMinimum: 0, maximum: 1440 },
        label: { type: 'string' },
      },
      required: ['minutes'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_timers',
    description: 'List running and ringing timers/reminders with their labels and time left.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'cancel_timer',
    description: 'Cancel timers whose label contains the given words, or "all".',
    input_schema: {
      type: 'object',
      properties: { which: { type: 'string' } },
      required: ['which'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_routines',
    description:
      'List the user\'s saved routines (named sequences of actions such as "Focus mode") with their steps.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'run_routine',
    description:
      "Run one of the user's saved routines by name. Use when they ask to start a routine or mode by name; call list_routines first if unsure of the exact name.",
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_weather',
    description:
      "Current weather and the forecast for the next few hours, today and tomorrow at the user's saved location, in their units. Use for questions about weather, rain, temperature, or whether to take a coat or umbrella.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'lock_screen',
    description: "Lock the user's computer (Windows lock screen).",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
].map((t) => ({ ...t, eager_input_streaming: true }) as Anthropic.Beta.BetaTool);

/** Validate a (tolerantly parsed) tool input; returns the intent to run, or an error. */
export function toIntent(
  name: string,
  input: unknown,
):
  | { intent: RawIntent }
  | { error: string }
  | { local: 'list_apps' | 'list_timers' | 'get_weather' | 'list_routines' } {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const str = (k: string): string | null =>
    typeof o[k] === 'string' && (o[k] as string).trim()
      ? (o[k] as string).trim().slice(0, 300)
      : null;
  switch (name) {
    case 'launch_app': {
      const app = str('app');
      return app ? { intent: { action: 'launch_app', target: app } } : { error: 'Missing "app".' };
    }
    case 'open_url': {
      const url = str('url');
      return url ? { intent: { action: 'open_url', target: url } } : { error: 'Missing "url".' };
    }
    case 'search_web': {
      const q = str('query');
      return q ? { intent: { action: 'search_web', target: q } } : { error: 'Missing "query".' };
    }
    case 'get_system_status':
      return { intent: { action: 'system_query', target: 'overview' } };
    case 'list_apps':
      return { local: 'list_apps' };
    case 'close_app': {
      const app = str('app');
      return app ? { intent: { action: 'close_app', target: app } } : { error: 'Missing "app".' };
    }
    case 'set_volume': {
      const level =
        typeof o['level'] === 'number' && Number.isFinite(o['level'])
          ? Math.round(o['level'] as number)
          : undefined;
      const mute = typeof o['mute'] === 'boolean' ? (o['mute'] as boolean) : undefined;
      if (level === undefined && mute === undefined)
        return { error: 'Give "level" (0-100) and/or "mute".' };
      if (level !== undefined && (level < 0 || level > 100))
        return { error: '"level" must be 0-100.' };
      return {
        intent: {
          action: 'set_volume',
          target: level === undefined ? '' : String(level),
          ...(mute === undefined ? {} : { args: [mute ? 'mute' : 'unmute'] }),
        },
      };
    }
    case 'media_control': {
      const a = str('action');
      return a && ['play_pause', 'next', 'previous', 'stop'].includes(a)
        ? { intent: { action: 'media_control', target: a } }
        : { error: '"action" must be play_pause, next, previous or stop.' };
    }
    case 'open_folder': {
      const f = str('folder')?.toLowerCase();
      return f ? { intent: { action: 'open_folder', target: f } } : { error: 'Missing "folder".' };
    }
    case 'find_files': {
      const q = str('query');
      return q ? { intent: { action: 'find_files', target: q } } : { error: 'Missing "query".' };
    }
    case 'reveal_file': {
      const p = str('path');
      return p ? { intent: { action: 'reveal_file', target: p } } : { error: 'Missing "path".' };
    }
    case 'set_timer': {
      const m =
        typeof o['minutes'] === 'number' && Number.isFinite(o['minutes'])
          ? (o['minutes'] as number)
          : NaN;
      if (!(m > 0 && m <= 1440)) return { error: '"minutes" must be between 0 and 1440.' };
      const label = str('label');
      return {
        intent: { action: 'set_timer', target: String(m), ...(label ? { args: [label] } : {}) },
      };
    }
    case 'list_timers':
      return { local: 'list_timers' };
    case 'get_weather':
      return { local: 'get_weather' };
    case 'list_routines':
      return { local: 'list_routines' };
    case 'run_routine': {
      const n = str('name');
      return n ? { intent: { action: 'run_routine', target: n } } : { error: 'Missing "name".' };
    }
    case 'cancel_timer': {
      const w = str('which');
      return w ? { intent: { action: 'cancel_timer', target: w } } : { error: 'Missing "which".' };
    }
    case 'lock_screen':
      return { intent: { action: 'lock_screen' } };
    default:
      return { error: `Unknown tool "${name}".` };
  }
}

/** Compact telemetry for the model (bytes → GB, rounded), so tool results stay small. */
/** "Wednesday 18 November 2026, 20:37 (Europe/London)": the user's local clock. */
export function localTimeText(now = new Date()): string {
  const date = now.toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
}

export function statsForModel(s: SystemStats): Record<string, unknown> {
  const gb = (b: number | null | undefined): number | null =>
    b == null ? null : Math.round((b / 1024 ** 3) * 10) / 10;
  return {
    localTime: localTimeText(new Date(s.timestamp || Date.now())),
    cpu: {
      loadPct: Math.round(s.cpu.load),
      threads: s.cpu.cores.length,
      ghz: s.cpu.speedGHz || null,
      tempC: s.cpu.temp,
    },
    memoryGB: { used: gb(s.memory.used), total: gb(s.memory.total) },
    gpu: s.gpu
      ? {
          name: s.gpu.name,
          loadPct: s.gpu.load,
          vramUsedGB: gb(s.gpu.memUsed),
          vramTotalGB: gb(s.gpu.memTotal),
          tempC: s.gpu.temp,
        }
      : null,
    disks: s.disks.map((d) => ({
      drive: d.mount,
      label: d.label,
      freeGB: gb(d.size - d.used),
      totalGB: gb(d.size),
    })),
    network: {
      downMBps: Math.round((s.network.down / 1024 ** 2) * 100) / 100,
      upMBps: Math.round((s.network.up / 1024 ** 2) * 100) / 100,
      pingMs: s.network.latencyMs,
      adapter: s.network.iface,
      wifi: s.network.ssid,
    },
    topProcesses: s.processes.slice(0, 5).map((p) => ({
      name: p.name,
      cpuPct: Math.round(p.cpu),
      memGB: gb(p.mem),
      ...(p.count && p.count > 1 ? { processes: p.count } : {}),
    })),
    battery: s.battery,
    uptimeHours: Math.round(s.uptime / 360) / 10,
  };
}

export interface AnthropicDeps {
  getKey(): Promise<string | null>;
  model(): AiModel;
  systemPrompt(): string;
  info(): SystemInfo | null;
  stats(): SystemStats;
  /** Fuller stats including top processes, read on demand for get_system_status. */
  detailedStats?(): Promise<SystemStats & { processesTimedOut?: boolean }>;
  /** Called when a turn starts, to pre-fetch slow data the model may ask for. */
  warm?(): void;
  apps(): Array<{ name: string; intents: string[] }>;
  timers?(): TimerInfo[];
  weather?(): WeatherData | null;
  routines?(): Routine[];
  /** Injectable for tests. */
  createClient?(apiKey: string): Pick<Anthropic, 'beta' | 'models'>;
}

export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic';
  private transcript: Msg[] = [];
  /** The top-level system prompt, fixed for the life of a conversation: Claude's earlier
   *  thinking is only valid while it stays byte-identical. Later changes are appended. */
  private system: string | null = null;
  /** The instructions most recently given (frozen ones, or the last appended update). */
  private lastSystem: string | null = null;

  constructor(private readonly deps: AnthropicDeps) {}

  reset(): void {
    this.transcript = [];
    this.system = null;
    this.lastSystem = null;
  }

  private client(key: string): Pick<Anthropic, 'beta' | 'models'> {
    return this.deps.createClient?.(key) ?? new Anthropic({ apiKey: key, maxRetries: 2 });
  }

  /** Check a key and model without spending credit (Models API). */
  async test(key?: string): Promise<{ ok: boolean; message: string }> {
    const k = key ?? (await this.deps.getKey());
    if (!k) return { ok: false, message: 'No API key saved.' };
    try {
      const m = await this.client(k).models.retrieve(this.deps.model());
      return {
        ok: true,
        message: `Connected. ${m.display_name ?? MODEL_LABEL[this.deps.model()]} is ready.`,
      };
    } catch (err) {
      return { ok: false, message: describeError(err) };
    }
  }

  /** Live stats for get_system_status, with processes when they arrive in time. */
  private async statusForModel(): Promise<Record<string, unknown>> {
    const s = (await this.deps.detailedStats?.()) ?? this.deps.stats();
    const out = statsForModel(s);
    if ('processesTimedOut' in s && s.processesTimedOut)
      out['topProcesses'] =
        'unavailable: Windows took too long to list processes; suggest Task Manager (Ctrl+Shift+Esc) if needed';
    return out;
  }

  private systemText(): string {
    const info = this.deps.info();
    const machine = info
      ? `The computer is "${info.hostname}" running ${info.osName} on ${info.cpuModel} (${info.cpuThreads} threads), ${Math.round(info.memTotal / 1024 ** 3)} GB RAM.`
      : '';
    const rules = [
      "You live inside ARC, a desktop assistant HUD on the user's own computer. Replies appear in a small console (and may be read aloud), so write plain sentences: no markdown headings, tables or code fences unless asked.",
      'Use the tools to act rather than describing what you would do. Actions may need the user to approve them; if one is cancelled or fails, say so briefly and suggest an alternative.',
      'Answer questions about the computer from get_system_status, never from guesses.',
      "Each user message is followed by a system note with the user's current local date and time, read from this computer's clock. It is accurate: answer questions about the time, date or day directly from it.",
      "You can also close apps, set the volume, control media playback, open folders, find files by name, show a file in Explorer, set, list and cancel timers/reminders, check the weather, run the user's saved routines, and lock the PC.",
      machine,
    ];
    return `${this.deps.systemPrompt()}\n\n${rules.filter(Boolean).join('\n')}`;
  }

  async *send(
    messages: Parameters<AIProvider['send']>[0],
    opts: SendOptions,
  ): AsyncIterable<ProviderChunk> {
    const key = await this.deps.getKey();
    if (!key) throw new Error('No API key saved. Add one in Settings › Advanced.');
    const client = this.client(key);
    const model = this.deps.model();
    const userText = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

    if (this.transcript.length > MAX_TRANSCRIPT) {
      this.reset();
      yield {
        type: 'notice',
        message: 'This conversation got long, so I started a fresh context for the AI.',
      };
    }
    this.deps.warm?.();
    // Defensive: never send a history the API would reject (e.g. a tool call with no result).
    this.transcript = repairTranscript(this.transcript);
    const start = this.transcript.length;
    /** Set once the turn left the transcript complete; otherwise it's rolled back below. */
    let finished = false;
    const now = new Date();
    // Instructions (personality, name, machine details) can change mid-conversation.
    // Rewriting the top-level system prompt would invalidate Claude's earlier thinking,
    // so the change is appended at this point instead, where it becomes true.
    const current = this.systemText();
    if (this.transcript.length === 0 || this.system === null) {
      this.system = current;
      this.lastSystem = current;
    }
    const changed = current !== this.lastSystem;
    this.lastSystem = current;
    // Per-turn context as a mid-conversation system message keeps the cached prefix intact.
    this.transcript.push(
      { role: 'user', content: userText },
      {
        role: 'system',
        content: [
          `Current local date and time (from this computer's clock): ${localTimeText(now)}.`,
          changed
            ? `Your instructions have been updated. From now on, follow these instead of the earlier ones:\n\n${current}`
            : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    );
    const system = this.system;
    let strippedThinking = false;

    try {
      let jsonRetries = 0;
      for (let step = 0; step < MAX_STEPS; step++) {
        const usesFallback = model !== 'claude-haiku-5-5'; // Haiku has no server-side fallback
        let message: Anthropic.Beta.BetaMessage;
        try {
          const stream = client.beta.messages.stream(
            {
              model,
              max_tokens: 64000,
              // Stable text, cached: the same for every request in this conversation.
              system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
              tools: TOOLS,
              // A snapshot: retries must not see messages appended later in this turn.
              messages: [...this.transcript],
              // Conversational route: low effort keeps replies quick and cheap.
              output_config: { effort: 'low' },
              // If earlier thinking no longer matches the history, drop it rather than fail.
              thinking: {
                type: 'adaptive',
                block_binding: { prefix_mismatch_behavior: 'drop_block' },
              },
              betas: [
                'thinking-binding-controls-2026-08-01',
                ...(usesFallback ? ['server-side-fallback-2026-07-01'] : []),
              ],
              ...(usesFallback ? { fallbacks: 'default' as const } : {}),
            },
            { signal: opts.signal },
          );

          for await (const ev of stream) {
            if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta')
              yield { type: 'text', delta: ev.delta.text };
          }
          message = await stream.finalMessage();
          jsonRetries = 0;
        } catch (err) {
          if (opts.signal?.aborted) throw err;
          // Last resort for stale thinking: remove it all and retry this request once.
          if (
            err instanceof Anthropic.BadRequestError &&
            !strippedThinking &&
            isStaleThinking(err)
          ) {
            strippedThinking = true;
            this.transcript = stripThinking(this.transcript);
            continue;
          }
          // Unparseable streamed tool input: re-issue the turn (API errors are rethrown).
          if (
            !(err instanceof Anthropic.APIError) &&
            !(err instanceof Anthropic.APIConnectionError) &&
            jsonRetries++ < 2
          )
            continue;
          throw err;
        }

        if (message.stop_reason === 'refusal') {
          this.transcript.length = start; // drop the declined turn
          yield {
            type: 'error',
            message: 'Claude declined to answer that one. Try rephrasing, or ask something else.',
          };
          return;
        }
        if (message.stop_reason === 'pause_turn') {
          this.transcript.push({ role: 'assistant', content: message.content });
          continue;
        }
        const toolUses = message.content.filter(
          (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
        );
        if (toolUses.length === 0) {
          this.transcript.push({ role: 'assistant', content: message.content });
          finished = true;
          yield { type: 'done' };
          return;
        }
        if (message.stop_reason === 'max_tokens') {
          this.transcript.length = start;
          yield {
            type: 'error',
            message: 'That reply ran too long to finish. Try asking for something smaller.',
          };
          return;
        }

        this.transcript.push({ role: 'assistant', content: message.content });
        const results: ToolResult[] = [];
        for (const t of toolUses) {
          const plan = toIntent(t.name, t.input);
          if ('error' in plan) {
            results.push({
              type: 'tool_result',
              tool_use_id: t.id,
              is_error: true,
              content: plan.error,
            });
            continue;
          }
          if ('local' in plan) {
            const w = plan.local === 'get_weather' ? (this.deps.weather?.() ?? null) : null;
            if (plan.local === 'get_weather' && !w) {
              results.push({
                type: 'tool_result',
                tool_use_id: t.id,
                is_error: true,
                content:
                  'No weather available: the user has not set a location (Settings › General › Weather), or the forecast could not be fetched yet.',
              });
              continue;
            }
            results.push({
              type: 'tool_result',
              tool_use_id: t.id,
              content: JSON.stringify(
                w
                  ? weatherSummary(w)
                  : plan.local === 'list_routines'
                    ? (this.deps.routines?.() ?? []).map((r) => ({
                        name: r.name,
                        phrases: r.phrases,
                        steps: r.steps.map(describeStep),
                        schedule: r.schedule ? describeSchedule(r.schedule) : null,
                      }))
                    : plan.local === 'list_apps'
                      ? this.deps.apps()
                      : (this.deps.timers?.() ?? []).map((x) => ({
                          label: x.label || '(no label)',
                          status: x.status,
                          minutesLeft: Math.max(0, Math.round((x.dueAt - Date.now()) / 6000) / 10),
                          due: new Date(x.dueAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          }),
                        })),
              ),
            });
            continue;
          }
          // Show the action in ARC (card, approval, activity log) and wait for its outcome.
          yield { type: 'intent', intent: plan.intent, toolUseId: t.id };
          const outcome: ToolOutcome = opts.runTool
            ? await opts.runTool(t.id, plan.intent)
            : { status: 'failed', message: 'Actions are unavailable.' };
          if (opts.signal?.aborted) return;
          const content =
            plan.intent.action === 'system_query' && outcome.status === 'success'
              ? JSON.stringify(await this.statusForModel())
              : `${outcome.status}: ${outcome.message}`;
          results.push({
            type: 'tool_result',
            tool_use_id: t.id,
            content,
            is_error: outcome.status === 'failed',
          });
        }
        this.transcript.push({ role: 'user', content: results });
      }
      // Ran out of steps: close the turn cleanly.
      this.transcript.push({
        role: 'assistant',
        content: 'I stopped there to avoid running too many steps in one go.',
      });
      finished = true;
      yield {
        type: 'text',
        delta: ' (I stopped there to avoid running too many steps in one go.)',
      };
      yield { type: 'done' };
    } catch (err) {
      // Leave the transcript as it was before this turn so the next one is valid.
      this.transcript.length = start;
      if (opts.signal?.aborted || err instanceof Anthropic.APIUserAbortError) return;
      if (
        err instanceof Anthropic.APIConnectionError &&
        !(err instanceof Anthropic.APIConnectionTimeoutError)
      )
        throw new OfflineError(describeError(err), { cause: err });
      throw new Error(describeError(err), { cause: err });
    } finally {
      // Covers early exits the catch doesn't see: an abort while waiting on an action,
      // or the caller stopping iteration. A half-finished turn must not stay in history.
      if (!finished) this.transcript.length = start;
    }
  }
}

/** Drop anything from the first broken spot onward: an assistant tool call not answered
 *  by tool results in the next message, or a mid-conversation system message that isn't
 *  last or followed by the assistant. Returns the input unchanged when it's valid. */
export function repairTranscript(msgs: Msg[]): Msg[] {
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i] as Msg;
    const next = msgs[i + 1];
    if (m.role === 'system' && next && next.role !== 'assistant') return msgs.slice(0, i);
    if (m.role !== 'assistant' || typeof m.content === 'string') continue;
    const ids = m.content.flatMap((b) => (b.type === 'tool_use' ? [b.id] : []));
    if (ids.length === 0) continue;
    const answered =
      next?.role === 'user' && Array.isArray(next.content)
        ? new Set(next.content.flatMap((b) => (b.type === 'tool_result' ? [b.tool_use_id] : [])))
        : new Set<string>();
    if (!ids.every((id) => answered.has(id)))
      return msgs.slice(0, Math.max(0, firstTurnStart(msgs, i)));
  }
  return msgs;
}

/** A 400 saying a replayed thinking block no longer matches this conversation. */
function isStaleThinking(err: InstanceType<typeof Anthropic.BadRequestError>): boolean {
  const detail = `${err.message} ${(err.error as { error?: { message?: string } } | undefined)?.error?.message ?? ''}`;
  return /`?thinking`? block/i.test(detail) && /signature|different conversation/i.test(detail);
}

/** The history without any thinking blocks (text and tool calls stay). Removing all of
 *  them is always accepted by the API; the model just loses that earlier reasoning. */
export function stripThinking(msgs: Msg[]): Msg[] {
  return msgs.map((m) => {
    if (m.role !== 'assistant' || typeof m.content === 'string') return m;
    const content = m.content.filter(
      (b) => b.type !== 'thinking' && b.type !== 'redacted_thinking',
    );
    return { ...m, content: content.length ? content : [{ type: 'text', text: '…' }] };
  });
}

/** Index of the user message that began the turn containing index i. */
function firstTurnStart(msgs: Msg[], i: number): number {
  for (let k = i; k >= 0; k--) {
    const m = msgs[k] as Msg;
    if (
      m.role === 'user' &&
      (typeof m.content === 'string' || !m.content.some((b) => b.type === 'tool_result'))
    )
      return k;
  }
  return 0;
}

/** Plain-English messages for API failures (typed checks, most specific first). */
export function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError)
    return 'Your Anthropic API key was rejected. Check it in Settings › Advanced.';
  if (err instanceof Anthropic.PermissionDeniedError)
    return "This API key isn't allowed to use that model. Check your Anthropic console.";
  if (err instanceof Anthropic.NotFoundError)
    return "That model isn't available to your account. Pick another in Settings › Advanced.";
  if (err instanceof Anthropic.RateLimitError)
    return 'Anthropic is limiting requests right now. Try again in a moment.';
  if (err instanceof Anthropic.BadRequestError) {
    const detail =
      (err.error as { error?: { message?: string } } | undefined)?.error?.message ?? err.message;
    return `Anthropic rejected the request: ${detail} (If your credit has run out, top up at console.anthropic.com.)`;
  }
  if (err instanceof Anthropic.InternalServerError)
    return 'Anthropic is having trouble right now. Try again shortly.';
  if (err instanceof Anthropic.APIConnectionTimeoutError)
    return 'Anthropic took too long to respond. Try again.';
  if (err instanceof Anthropic.APIConnectionError)
    return "I couldn't reach Anthropic. Check your internet connection.";
  if (err instanceof Anthropic.APIError)
    return `Anthropic error ${err.status ?? ''}: ${err.message}`.trim();
  return err instanceof Error ? err.message : 'Something went wrong talking to Claude.';
}
