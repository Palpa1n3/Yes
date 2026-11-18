/** AI provider abstraction. Real providers (Claude, OpenAI, local) implement AIProvider
 *  later; API keys will live in main via Electron safeStorage, never in the renderer. */
import {
  DEFAULT_PERSONALITY,
  pickGreeting,
  pickPhrase,
  resolveTitle,
  type Personality,
} from '@shared/personalities';
import type { ChatMessage, ProviderChunk, RawIntent, SystemStats, ToolDef } from '@shared/types';
import { snapshot } from './system-stats';

export interface SendOptions {
  systemPrompt: string;
  tools?: ToolDef[];
  signal?: AbortSignal;
}

export interface AIProvider {
  id: string;
  send(messages: ChatMessage[], opts: SendOptions): AsyncIterable<ProviderChunk>;
}

/** What the mock needs to imitate a personality (a real model gets the system prompt). */
export interface Persona {
  personality: Personality;
  userName: string;
}

/* ── MockProvider ───────────────────────────────────────────────────────── */

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });

const pick = <T>(xs: readonly T[], seed: number): T => xs[Math.abs(seed) % xs.length] as T;

/** Friendly names for common targets, so replies read naturally. */
const APP_NAMES: Record<string, string> = {
  vscode: 'Visual Studio Code',
  'vs code': 'Visual Studio Code',
  code: 'Visual Studio Code',
  chrome: 'Chrome',
  browser: 'Chrome',
  spotify: 'Spotify',
  discord: 'Discord',
  steam: 'Steam',
  terminal: 'Terminal',
  explorer: 'File Explorer',
  files: 'File Explorer',
  obs: 'OBS Studio',
  obsidian: 'Obsidian',
  notes: 'Obsidian',
  calculator: 'Calculator',
  calc: 'Calculator',
  settings: 'Settings',
  'task manager': 'Task Manager',
};
const appName = (t: string): string =>
  APP_NAMES[t.toLowerCase()] ?? t.replace(/\b\w/g, (c) => c.toUpperCase());

interface Plan {
  text: string;
  intent?: RawIntent;
  /** Text streamed after the intent (e.g. a follow-up remark). */
  after?: string;
  error?: string;
}

// Deliberately varied phrasing, so canonIntent() is exercised end to end.
const LAUNCH_PHRASES = ['open app', 'launch application', 'start'] as const;

const JOKES = [
  'I would tell you a UDP joke, but you might not get it.',
  'There are 10 kinds of people: those who understand binary, and those who asked me for a joke.',
  'I tried to write a joke about recursion, but I tried to write a joke about recursion.',
  'My mock brain runs on caffeine-free electrons. It shows.',
] as const;

export function plan(
  input: string,
  turn: number,
  getStats: () => SystemStats,
  persona: Persona,
): Plan {
  const { personality: p } = persona;
  const title = resolveTitle(p.userTitle, persona.userName);
  const v = p.verbosity;
  const t = (s: string): string => s.replace(/\{,title\}/g, title ? `, ${title}` : '');
  const ack = (): string => pickPhrase(p.acknowledgements, title, (turn * 0.37) % 1);
  const q = input.trim();
  const lower = q.toLowerCase();
  let m: RegExpMatchArray | null;

  if (/^(hi|hello|hey|good (morning|afternoon|evening)|yo)\b/.test(lower)) {
    return { text: pickGreeting(p, title, new Date().getHours(), (turn * 0.61) % 1) };
  }
  if (
    (m = lower.match(/^(?:please\s+)?(?:open|launch|start|run|fire up)\s+(?:up\s+)?(.+?)[.!]?$/))
  ) {
    const target = m[1] ?? '';
    if (/\.[a-z]{2,}(\/|$)/.test(target) || target.startsWith('http')) {
      return {
        text: v <= 1 ? `Opening ${target}.` : `${ack()} Opening ${target} in your browser.`,
        intent: { action: 'open website', target },
      };
    }
    const name = appName(target);
    const text =
      v <= 1
        ? `Launching ${name}.`
        : v >= 5
          ? `${ack()} I'll look up ${name} in your app list, falling back to the Start menu, then launch it as its own process so it keeps running if I close.`
          : `${ack()} Launching ${name}.`;
    return { text, intent: { action: pick(LAUNCH_PHRASES, turn), target: target.toLowerCase() } };
  }
  if ((m = lower.match(/^(?:search(?: the web)?(?: for)?|google|look up)\s+(.+?)[?.!]?$/))) {
    const text =
      v <= 1
        ? `Searching: “${m[1]}”.`
        : v >= 5
          ? `${ack()} I'll run a web search for “${m[1]}” and open the results in your default browser.`
          : `Searching the web for “${m[1]}”.`;
    return { text, intent: { action: 'web search', target: m[1] } };
  }
  if ((m = lower.match(/^(?:go to|visit|navigate to)\s+(.+?)[.!]?$/))) {
    return {
      text: v <= 1 ? `Opening ${m[1]}.` : `Navigating to ${m[1]}.`,
      intent: { action: 'go to', target: m[1] },
    };
  }
  if (
    /\b(cpu|ram|memory|system|how('?s| is) my (pc|computer|machine)|diagnostic|status)\b/.test(
      lower,
    )
  ) {
    const s = getStats();
    const gb = (b: number): string => (b / 1024 ** 3).toFixed(1);
    const hrs = Math.floor(s.uptime / 3600);
    const cpu = Math.round(s.cpu.load);
    const hot = (s.cpu.temp ?? 0) >= 80;
    if (v <= 1) {
      return {
        text: '',
        intent: { action: 'system status', target: 'overview' },
        after: `CPU ${cpu}% · RAM ${gb(s.memory.used)}/${gb(s.memory.total)} GB · up ${hrs}h.`,
      };
    }
    const verdict = hot
      ? `The processor is running warm at ${Math.round(s.cpu.temp ?? 0)}°C.`
      : p.humour >= 2
        ? t('Nothing alarming{,title}.')
        : 'All normal.';
    return {
      text: 'Running a quick diagnostic.',
      intent: { action: 'system status', target: 'overview' },
      after: ` Processor is at ${cpu}% across ${s.cpu.cores.length} threads, memory ${gb(s.memory.used)} of ${gb(s.memory.total)} GB, and we've been up ${hrs} hours. ${verdict}`,
    };
  }
  if (/\b(time|date|day is it)\b/.test(lower)) {
    const d = new Date();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return {
      text:
        v <= 1
          ? `${time}.`
          : `It's ${time} on ${d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}.`,
    };
  }
  if (/\bjoke\b/.test(lower)) {
    if (p.humour === 0)
      return {
        text:
          v <= 1
            ? 'Humour disabled.'
            : 'Humour is switched off in this personality. You can turn it up in Settings.',
      };
    return { text: pick(JOKES, turn) };
  }
  if (/\b(thanks|thank you|cheers)\b/.test(lower)) {
    return {
      text:
        v <= 1
          ? 'OK.'
          : t(pick(['My pleasure{,title}.', 'Always.', 'Happy to help{,title}.'], turn)),
    };
  }
  if (/\b(fail|break|crash)\b/.test(lower)) {
    return {
      text: v <= 1 ? 'Attempting.' : 'Attempting that now',
      error: 'Simulated provider failure (you asked me to break).',
    };
  }
  if (v <= 1)
    return {
      text: 'Not supported by the mock provider. Try: open <app>, search <query>, system status.',
    };
  return {
    text: t(
      pick(
        [
          "I'm running on the mock provider for now{,title}, so my repertoire is limited. Try “open spotify”, “search for cheap flights”, or “how's my system?”.",
          'Noted. Once a real model is connected I will have a proper answer for that. Meanwhile I can open apps, search the web, or report on the system.',
          p.humour >= 2
            ? 'An excellent question{,title}, and one my mock brain is not equipped for. Ask me to launch something instead?'
            : "I can't answer that yet. I can open apps, search the web, or check the system.",
        ],
        turn,
      ),
    ),
  };
}

/** Canned, personality-aware replies with realistic think time and word-by-word streaming. */
export class MockProvider implements AIProvider {
  readonly id = 'mock';
  private turn = 0;

  constructor(
    /** Live telemetry when available; a basic `os` snapshot otherwise (e.g. in tests). */
    private readonly getStats: () => SystemStats = snapshot,
    private readonly getPersona: () => Persona | null = () => null,
  ) {}

  async *send(messages: ChatMessage[], opts: SendOptions): AsyncIterable<ProviderChunk> {
    const { signal } = opts;
    const last = [...messages].reverse().find((m) => m.role === 'user');
    const persona = this.getPersona() ?? { personality: DEFAULT_PERSONALITY, userName: '' };
    const p = plan(last?.content ?? '', this.turn++, this.getStats, persona);

    await sleep(350 + Math.random() * 450, signal); // "thinking"
    if (signal?.aborted) return;

    if (p.text) yield* this.stream(p.text, signal);
    if (signal?.aborted) return;
    if (p.error) {
      await sleep(250, signal);
      yield { type: 'error', message: p.error };
      return;
    }
    if (p.intent) {
      await sleep(150, signal);
      yield { type: 'intent', intent: p.intent };
    }
    if (p.after) {
      await sleep(500, signal);
      yield* this.stream(p.after, signal);
    }
    if (!signal?.aborted) yield { type: 'done' };
  }

  private async *stream(text: string, signal?: AbortSignal): AsyncIterable<ProviderChunk> {
    // Words keep their leading space so deltas concatenate exactly.
    for (const word of text.match(/\s*\S+/g) ?? []) {
      if (signal?.aborted) return;
      yield { type: 'text', delta: word };
      await sleep(25 + Math.random() * 55, signal);
    }
  }
}
