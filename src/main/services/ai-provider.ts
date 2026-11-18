/** AI provider abstraction. Real providers (Claude, OpenAI, local) implement AIProvider
 *  later; API keys will live in main via Electron safeStorage, never in the renderer. */
import {
  DEFAULT_PERSONALITY,
  pickGreeting,
  pickPhrase,
  resolveTitle,
  type Personality,
} from '@shared/personalities';
import type {
  ChatMessage,
  ProviderChunk,
  RawIntent,
  SystemStats,
  ToolDef,
  ToolOutcome,
} from '@shared/types';
import { describeWeather, rainSoon, tempSymbol, type WeatherData } from '@shared/weather';
import { agendaSentence, eventsOn, fmtTime, type CalEvent } from '@shared/calendar';
import { listName, splitItems } from '@shared/notes';
import type { NowPlaying } from '@shared/media';
import { snapshot } from './system-stats';

/** What the offline brain needs from the notes store. */
export interface NotesApi {
  tool(name: string, input: unknown): unknown;
  memories(): string[];
}

export interface SendOptions {
  systemPrompt: string;
  tools?: ToolDef[];
  signal?: AbortSignal;
  /** Run an action through ARC (cards, approval) and resolve with its outcome. */
  runTool?(toolUseId: string, intent: RawIntent): Promise<ToolOutcome>;
  /** Research mode: web search, a smarter model, fuller answers with sources. */
  research?: boolean;
}

export interface AIProvider {
  id: string;
  send(messages: ChatMessage[], opts: SendOptions): AsyncIterable<ProviderChunk>;
  /** Forget any conversation state the provider keeps. */
  reset?(): void;
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
  getWeather: () => WeatherData | null = () => null,
  getCalendar: () => CalEvent[] | null = () => null,
  notes: NotesApi | null = null,
  nowPlaying: () => NowPlaying | null = () => null,
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
  const ok = (detail: string): string => (v <= 1 ? detail : `${ack()} ${detail}`);

  // ── System actions (checked before "open X", which would otherwise swallow "open downloads") ──
  if (
    (m = lower.match(
      /^(?:please\s+)?(?:open|show)\s+(?:my\s+|the\s+)?(documents|downloads|desktop|pictures|videos|music)(?:\s+folder)?[.!]?$/,
    ))
  ) {
    return {
      text: ok(`Opening your ${m[1]} folder.`),
      intent: { action: 'open_folder', target: m[1] },
    };
  }
  if (
    /\b(what'?s|what is) (this|that) song\b|\bwhat song is (this|that|playing)\b|\bwhat'?s playing\b|\bnow playing\b|\bwho sings (this|that)\b/.test(
      lower,
    )
  ) {
    const n = nowPlaying();
    return {
      text: !n
        ? v <= 1
          ? 'Nothing playing.'
          : "Nothing's playing right now that Windows can see."
        : `${n.playing ? '' : 'Paused: '}${n.title}${n.artist ? ` by ${n.artist}` : ''}${v <= 1 ? '' : `, in ${n.app}`}.`,
    };
  }
  if (notes) {
    const said = (r: unknown): Record<string, unknown> =>
      r && typeof r === 'object' ? (r as Record<string, unknown>) : {};
    // "add milk and eggs to my shopping list" / "put bread on the list"
    if (
      (m = q.match(
        /^(?:please\s+)?(?:add|put)\s+(.+?)\s+(?:to|on(?:to)?)\s+(?:my\s+|the\s+)?(.+?)\s*list[.!]?$/i,
      ))
    ) {
      const items = splitItems(m[1] ?? '');
      const r = said(notes.tool('add_to_list', { list: m[2] || 'To-do', items }));
      return {
        text:
          v <= 1
            ? `Added to ${String(r['list'])}.`
            : t(
                `Added ${items.join(', ')} to your ${String(r['list']).toLowerCase()} list{,title}.`,
              ),
      };
    }
    // "what's on my shopping list" / "read my to-do list"
    if (
      (m = lower.match(
        /^(?:what'?s|what is)\s+on\s+(?:my\s+|the\s+)?(.+?)\s*list\??$|^(?:read|show)\s+(?:me\s+)?(?:my\s+|the\s+)?(.+?)\s*list[.!]?$/,
      ))
    ) {
      const name = listName(m[1] ?? m[2] ?? '');
      const lists = notes.tool('get_lists', {}) as Array<{ list: string; toDo: string[] }>;
      const l = lists.find((x) => x.list.toLowerCase() === name.toLowerCase());
      return {
        text: !l
          ? `You don't have a ${name.toLowerCase()} list yet. Say “add … to my ${name.toLowerCase()} list” to start one.`
          : l.toDo.length
            ? `${l.list}: ${l.toDo.join(', ')}.`
            : `Your ${l.list.toLowerCase()} list is empty.`,
      };
    }
    // "tick off milk" / "cross eggs off my shopping list" (needs "off": not "check the weather")
    if (
      (m = lower.match(
        /^(?:tick|cross|check)\s+(?:off\s+(.+?)|(.+?)\s+off)(?:\s+(?:from|on)\s+(?:my\s+|the\s+)?(.+?)\s*list)?[.!]?$/,
      ))
    ) {
      const r = said(
        notes.tool('update_list_item', { item: m[1] ?? m[2], list: m[3], action: 'done' }),
      );
      return {
        text: r['error']
          ? String(r['error'])
          : t(`Ticked off ${(r['tickedOff'] as string[]).join(', ')}{,title}.`),
      };
    }
    // "take a note: …" / "note that …"
    if ((m = q.match(/^(?:take\s+a\s+note|make\s+a\s+note|note\s+(?:that|down))[:,]?\s+(.+)$/i))) {
      notes.tool('add_note', { text: m[1] });
      return { text: v <= 1 ? 'Noted.' : t('Noted{,title}. It’s in the Notes tab.') };
    }
    // "what do you remember (about me)?"
    if (/^what (?:do you|have you) (?:remember|know)(?: about me)?\??$/.test(lower)) {
      const facts = notes.memories();
      return {
        text: facts.length
          ? `I remember: ${facts.join('; ')}.`
          : "I haven't been asked to remember anything yet. Say “remember that …”.",
      };
    }
    // "forget that I …"
    if ((m = q.match(/^forget\s+(?:that\s+|about\s+)?(.+?)[.!]?$/i))) {
      const r = said(notes.tool('forget', { about: m[1] }));
      return {
        text: r['error'] ? "I don't have anything like that remembered." : t('Forgotten{,title}.'),
      };
    }
    // "remember that I take my coffee black"
    if (
      (m = q.match(/^(?:please\s+)?remember\s+(?:that\s+)?(.+?)[.!]?$/i)) &&
      !/^to\b/i.test(m[1] ?? '')
    ) {
      notes.tool('remember', { fact: m[1] });
      return { text: v <= 1 ? 'Remembered.' : t('I’ll remember that{,title}.') };
    }
  }
  if ((m = lower.match(/^(?:please\s+)?(?:close|quit|exit)\s+(.+?)[.!]?$/))) {
    return {
      text: ok(`Closing ${appName(m[1] ?? '')}.`),
      intent: { action: 'close_app', target: (m[1] ?? '').trim() },
    };
  }
  if ((m = lower.match(/^(un)?mute(?:\s+(?:the\s+)?(?:sound|audio|volume))?[.!]?$/))) {
    return {
      text: ok(m[1] ? 'Unmuting.' : 'Muting.'),
      intent: { action: 'set_volume', target: '', args: [m[1] ? 'unmute' : 'mute'] },
    };
  }
  if (
    (m = lower.match(/\bvolume\s+(?:to\s+|at\s+)?(\d{1,3})\s*%?/)) ||
    (m = lower.match(/^(?:set\s+)?(?:the\s+)?(?:sound|volume)\s+(?:to\s+)?(\d{1,3})/))
  ) {
    return {
      text: ok(`Setting the volume to ${m[1]}%.`),
      intent: { action: 'set_volume', target: m[1] },
    };
  }
  if (
    /^(?:pause|play|resume)(?:\s+(?:the\s+)?(?:music|song|video|playback|track))?[.!]?$/.test(lower)
  ) {
    return {
      text: ok('Toggling playback.'),
      intent: { action: 'media_control', target: 'play_pause' },
    };
  }
  if (/^(?:next|skip)(?:\s+(?:this\s+)?(?:song|track))?[.!]?$/.test(lower)) {
    return {
      text: ok('Skipping to the next track.'),
      intent: { action: 'media_control', target: 'next' },
    };
  }
  if (/^(?:previous|last|go back(?:\s+a)?)\s+(?:song|track)[.!]?$/.test(lower)) {
    return {
      text: ok('Going back a track.'),
      intent: { action: 'media_control', target: 'previous' },
    };
  }
  if (
    (m = lower.match(
      /(?:remind me|set (?:a )?(?:timer|reminder)|timer)\s+(?:for\s+|in\s+)?(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b(?:\s+(?:to|that|for|about)\s+(.+?))?[.!]?$/,
    ))
  ) {
    const n = Number(m[1]);
    const unit = m[2] ?? 'minutes';
    const minutes = unit.startsWith('s') ? n / 60 : unit.startsWith('h') ? n * 60 : n;
    const label = m[3]?.trim();
    return {
      text: ok(`Timer set for ${m[1]} ${unit}${label ? ` to ${label}` : ''}.`),
      intent: { action: 'set_timer', target: String(minutes), ...(label ? { args: [label] } : {}) },
    };
  }
  if (
    (m = lower.match(
      /^(?:cancel|stop|delete|clear)\s+(?:my\s+|the\s+)?(all\s+)?(?:(.+?)\s+)?(?:timers?|reminders?|alarms?)[.!]?$/,
    ))
  ) {
    const which = m[1] ? 'all' : (m[2]?.trim() ?? 'all');
    return {
      text: ok(which === 'all' ? 'Cancelling your timers.' : `Cancelling the ${which} timer.`),
      intent: { action: 'cancel_timer', target: which },
    };
  }
  if (/^lock(?:\s+(?:my|the))?(?:\s+(?:pc|computer|screen|workstation))?[.!]?$/.test(lower)) {
    return { text: ok('Locking your computer.'), intent: { action: 'lock_screen' } };
  }
  if (
    (m = lower.match(
      /^(?:find|locate|where(?:'s| is))\s+(?:my\s+)?(?:the\s+)?(?:files?\s+(?:called|named)\s+)?(.+?)[?.!]?$/,
    ))
  ) {
    return {
      text: ok(`Looking for “${m[1]}” in your folders.`),
      intent: { action: 'find_files', target: m[1] },
    };
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
  if (
    /\b(calendar|schedule|agenda|appointments?|meetings?|what'?s on|what have i got|am i (busy|free)|plans? (for )?(today|tomorrow))\b/.test(
      lower,
    )
  ) {
    const events = getCalendar();
    if (!events)
      return {
        text:
          v <= 1
            ? 'No calendar connected. Settings › General › Calendar.'
            : 'Your calendar is not connected yet. Add your Google Calendar in Settings › General › Calendar and I will keep you posted.',
      };
    const now = Date.now();
    if (/\btomorrow\b/.test(lower)) {
      const tm = new Date(now);
      tm.setDate(tm.getDate() + 1);
      const list = eventsOn(events, tm.getTime());
      return {
        text: list.length
          ? `Tomorrow: ${list.map((e) => (e.allDay ? e.title : `${e.title} at ${fmtTime(e.start)}`)).join(', ')}.`
          : t('Nothing in the diary for tomorrow{,title}.'),
      };
    }
    return { text: agendaSentence(events, now, v <= 1) };
  }
  if (
    /\b(weather|forecast|rain(ing|y)?|umbrella|coat|jacket|temperature|how (hot|cold|warm))\b/.test(
      lower,
    )
  ) {
    const w = getWeather();
    if (!w)
      return {
        text:
          v <= 1
            ? 'No location set. Settings › General › Weather.'
            : "I don't know where you are yet. Add your town in Settings › General › Weather and I'll keep an eye on the sky.",
      };
    const T = tempSymbol(w.units.temp);
    const now = describeWeather(w.current.code, w.current.isDay).label.toLowerCase();
    const temp = `${Math.round(w.current.temp)}${T}`;
    const rain = rainSoon(w);
    if (v <= 1)
      return {
        text: `${temp}, ${now}. High ${Math.round(w.today.max)}${T}.${rain !== null ? ` Rain ${rain}%.` : ''}`,
      };
    const advice =
      rain !== null && rain >= 50
        ? ' Take an umbrella.'
        : w.current.feels <= (w.units.temp === 'f' ? 45 : 7)
          ? t(' Wrap up warm{,title}.')
          : rain !== null && rain >= 25
            ? ' Possible showers later.'
            : '';
    return {
      text: `It's ${temp} and ${now} in ${w.place.name}, feeling like ${Math.round(w.current.feels)}${T}. Today ${Math.round(w.today.min)} to ${Math.round(w.today.max)}${T}${rain !== null ? `, ${rain}% chance of rain over the next few hours` : ''}.${advice}`,
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
    private readonly getWeather: () => WeatherData | null = () => null,
    private readonly getCalendar: () => CalEvent[] | null = () => null,
    private readonly notes: NotesApi | null = null,
    private readonly nowPlaying: () => NowPlaying | null = () => null,
  ) {}

  async *send(messages: ChatMessage[], opts: SendOptions): AsyncIterable<ProviderChunk> {
    const { signal } = opts;
    const last = [...messages].reverse().find((m) => m.role === 'user');
    const persona = this.getPersona() ?? { personality: DEFAULT_PERSONALITY, userName: '' };
    const p = plan(
      last?.content ?? '',
      this.turn++,
      this.getStats,
      persona,
      this.getWeather,
      this.getCalendar,
      this.notes,
      this.nowPlaying,
    );

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
