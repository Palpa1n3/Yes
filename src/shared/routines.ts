/** Routines: a named list of steps run in order with one phrase ("work mode") or a click.
 *  Action steps become canonical commands and run through the same executor as chat, so
 *  the safety rules (polite close, own folders only, http(s) only...) still apply. */
import { MEDIA_KEYS } from './commands';
import { dayPart, resolveTitle, type Personality } from './personalities';
import type { RawIntent, SystemStats, TimerInfo, UserFolder } from './types';
import { USER_FOLDERS } from './types';
import { describeWeather, rainSoon, tempSymbol, type WeatherData } from './weather';

export const STEP_KINDS = [
  'launch_app',
  'close_app',
  'set_volume',
  'media_control',
  'open_folder',
  'open_url',
  'search_web',
  'set_timer',
  'say',
  'briefing',
  'wait',
  'lock_screen',
] as const;
export type StepKind = (typeof STEP_KINDS)[number];

export interface RoutineStep {
  kind: StepKind;
  /** App name, volume 0–100 / "mute" / "unmute", media key, folder, URL, search text,
   *  timer minutes, words to say, or seconds to wait. Unused by briefing and lock_screen. */
  target?: string;
  /** Timer label. */
  label?: string;
}

export const ROUTINE_ICONS = [
  'Sun',
  'Target',
  'Moon',
  'Gamepad2',
  'Briefcase',
  'Music',
  'Zap',
  'Coffee',
] as const;
export type RoutineIcon = (typeof ROUTINE_ICONS)[number];

export interface Routine {
  id: string;
  name: string;
  icon: RoutineIcon;
  /** Extra phrases that run it (its name always works too). */
  phrases: string[];
  steps: RoutineStep[];
  /** Run when ARC starts, at most once a day. */
  runAtStartup: boolean;
  lastRun?: number;
}

export const MAX_ROUTINES = 30;
export const MAX_STEPS = 20;
export const MAX_WAIT_S = 60;

export interface StepMeta {
  label: string;
  /** Placeholder for the target field; absent = no target. */
  placeholder?: string;
  options?: ReadonlyArray<{ value: string; label: string }>;
}

export const STEP_META: Record<StepKind, StepMeta> = {
  launch_app: { label: 'Open app', placeholder: 'App name, e.g. Spotify' },
  close_app: { label: 'Close app', placeholder: 'App name, e.g. Discord' },
  set_volume: { label: 'Set volume', placeholder: '0–100, mute or unmute' },
  media_control: {
    label: 'Music control',
    options: [
      { value: 'play_pause', label: 'Play / pause' },
      { value: 'next', label: 'Next track' },
      { value: 'previous', label: 'Previous track' },
      { value: 'stop', label: 'Stop' },
    ],
  },
  open_folder: {
    label: 'Open folder',
    options: USER_FOLDERS.map((f) => ({ value: f, label: f.charAt(0).toUpperCase() + f.slice(1) })),
  },
  open_url: { label: 'Open website', placeholder: 'e.g. youtube.com' },
  search_web: { label: 'Search the web', placeholder: 'Search words' },
  set_timer: { label: 'Start timer', placeholder: 'Minutes' },
  say: { label: 'Say', placeholder: 'Words for ARC to say' },
  briefing: { label: 'Briefing' },
  wait: { label: 'Wait', placeholder: 'Seconds (up to 60)' },
  lock_screen: { label: 'Lock PC' },
};

const clip = (v: unknown, n: number): string => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/** Validate one step; null if it can't run as stored. */
export function sanitizeStep(raw: unknown): RoutineStep | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const kind = o['kind'];
  if (typeof kind !== 'string' || !(STEP_KINDS as readonly string[]).includes(kind)) return null;
  const k = kind as StepKind;
  const target = clip(o['target'], k === 'say' ? 400 : 200);
  const label = clip(o['label'], 120);
  if (k === 'briefing' || k === 'lock_screen') return { kind: k };
  return {
    kind: k,
    ...(target ? { target } : {}),
    ...(k === 'set_timer' && label ? { label } : {}),
  };
}

/** What's wrong with a step, for the editor (null = fine). */
export function stepProblem(s: RoutineStep): string | null {
  const t = s.target?.trim() ?? '';
  const n = Number(t);
  switch (s.kind) {
    case 'briefing':
    case 'lock_screen':
      return null;
    case 'set_volume':
      return /^(mute|unmute)$/i.test(t) || (t !== '' && Number.isFinite(n) && n >= 0 && n <= 100)
        ? null
        : 'Use a number from 0 to 100, or mute / unmute.';
    case 'media_control':
      return (MEDIA_KEYS as readonly string[]).includes(t) ? null : 'Pick a music action.';
    case 'open_folder':
      return (USER_FOLDERS as readonly string[]).includes(t) ? null : 'Pick a folder.';
    case 'set_timer':
      return t !== '' && Number.isFinite(n) && n > 0 && n <= 1440
        ? null
        : 'Minutes from 0.1 to 1440.';
    case 'wait':
      return t !== '' && Number.isFinite(n) && n > 0 && n <= MAX_WAIT_S
        ? null
        : `Seconds from 1 to ${MAX_WAIT_S}.`;
    default:
      return t ? null : 'This step needs something filled in.';
  }
}

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'routine';

export function newRoutineId(name: string, taken: ReadonlySet<string>): string {
  const base = slug(name);
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
}

export function sanitizeRoutine(raw: unknown): Routine | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const name = clip(o['name'], 40);
  if (!name) return null;
  const id =
    typeof o['id'] === 'string' && /^[a-z0-9-]{1,48}$/.test(o['id']) ? o['id'] : slug(name);
  const icon = (ROUTINE_ICONS as readonly string[]).includes(o['icon'] as string)
    ? (o['icon'] as RoutineIcon)
    : 'Zap';
  const phrases = Array.isArray(o['phrases'])
    ? [...new Set(o['phrases'].map((p) => clip(p, 60)).filter(Boolean))].slice(0, 8)
    : [];
  const steps = Array.isArray(o['steps'])
    ? o['steps']
        .map(sanitizeStep)
        .filter((s): s is RoutineStep => s !== null)
        .slice(0, MAX_STEPS)
    : [];
  const lastRun = typeof o['lastRun'] === 'number' && o['lastRun'] > 0 ? o['lastRun'] : undefined;
  return {
    id,
    name,
    icon,
    phrases,
    steps,
    runAtStartup: o['runAtStartup'] === true,
    ...(lastRun ? { lastRun } : {}),
  };
}

export function sanitizeRoutines(raw: unknown): Routine[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Routine[] = [];
  for (const r of raw) {
    const ok = sanitizeRoutine(r);
    if (!ok || seen.has(ok.id)) continue;
    seen.add(ok.id);
    out.push(ok);
    if (out.length >= MAX_ROUTINES) break;
  }
  return out;
}

export const DEFAULT_ROUTINES: Routine[] = [
  {
    id: 'morning-briefing',
    name: 'Morning briefing',
    icon: 'Sun',
    phrases: ['good morning', 'briefing', 'daily brief', 'brief me'],
    steps: [{ kind: 'briefing' }],
    runAtStartup: false,
  },
  {
    id: 'focus-mode',
    name: 'Focus mode',
    icon: 'Target',
    phrases: ['focus', 'work mode', 'start working'],
    steps: [
      { kind: 'set_volume', target: '30' },
      { kind: 'set_timer', target: '25', label: 'Focus session over: take a 5 minute break' },
      {
        kind: 'say',
        target: 'Focus mode on. 25 minutes on the clock. I will tell you when to rest.',
      },
    ],
    runAtStartup: false,
  },
  {
    id: 'wind-down',
    name: 'Wind down',
    icon: 'Moon',
    phrases: ['bedtime', 'good night', 'goodnight'],
    steps: [
      { kind: 'set_volume', target: '20' },
      { kind: 'set_timer', target: '30', label: 'Time for bed' },
      { kind: 'say', target: 'Winding down. I have set a 30 minute bedtime reminder.' },
    ],
    runAtStartup: false,
  },
];

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const PREFIX =
  /^(?:please |hey arc |arc )?(?:run |start |do |begin |activate |go into |switch to |enter )?(?:the |my )?/;
const SUFFIX = / (?:routine|please|now)$/;

/** The routine a whole message names ("work mode", "run focus mode", "good morning!"). */
export function matchRoutine(text: string, routines: readonly Routine[]): Routine | undefined {
  const t = norm(text);
  if (!t || t.length > 60) return undefined;
  const bare = t.replace(PREFIX, '').replace(SUFFIX, '').trim();
  for (const r of routines) {
    const names = [r.name, ...r.phrases].map(norm).filter(Boolean);
    if (names.includes(t) || names.includes(bare)) return r;
  }
  return undefined;
}

/** Looser lookup by name, for Claude's run_routine tool. */
export function findRoutine(name: string, routines: readonly Routine[]): Routine | undefined {
  const n = norm(name)
    .replace(SUFFIX, '')
    .replace(/ mode$/, '');
  if (!n) return undefined;
  return (
    matchRoutine(name, routines) ??
    routines.find((r) => norm(r.name).replace(/ mode$/, '') === n) ??
    routines.find((r) => norm(r.name).includes(n))
  );
}

/** The command an action step runs; null for say / briefing / wait. */
export function stepIntent(s: RoutineStep): RawIntent | null {
  const t = s.target?.trim() ?? '';
  switch (s.kind) {
    case 'say':
    case 'briefing':
    case 'wait':
      return null;
    case 'set_volume':
      return /^(mute|unmute)$/i.test(t)
        ? { action: 'set_volume', args: [t.toLowerCase()] }
        : { action: 'set_volume', target: t };
    case 'set_timer':
      return { action: 'set_timer', target: t, ...(s.label ? { args: [s.label] } : {}) };
    case 'open_folder':
      return { action: 'open_folder', target: t.toLowerCase() as UserFolder };
    case 'lock_screen':
      return { action: 'lock_screen' };
    default:
      return { action: s.kind, target: t };
  }
}

/** Short human description: "Open app · Spotify". */
export function describeStep(s: RoutineStep): string {
  const m = STEP_META[s.kind];
  const t = s.target?.trim() ?? '';
  const opt = m.options?.find((o) => o.value === t)?.label;
  switch (s.kind) {
    case 'briefing':
      return 'Briefing: time, weather, timers and PC health';
    case 'lock_screen':
      return m.label;
    case 'set_volume':
      return /^(mute|unmute)$/i.test(t)
        ? `${t.charAt(0).toUpperCase()}${t.slice(1).toLowerCase()} sound`
        : `Volume to ${t}%`;
    case 'set_timer':
      return `${m.label} · ${t} min${s.label ? ` · ${s.label}` : ''}`;
    case 'wait':
      return `Wait ${t} s`;
    case 'say':
      return `Say “${t}”`;
    default:
      return `${m.label} · ${opt ?? t}`;
  }
}

export const isToday = (ts: number | undefined, now: number): boolean =>
  !!ts && new Date(ts).toDateString() === new Date(now).toDateString();

export interface BriefingInput {
  now: number;
  personality: Personality;
  userName: string;
  weather: WeatherData | null;
  weatherConfigured: boolean;
  timers: TimerInfo[];
  stats: SystemStats | null;
}

const GREETING: Record<ReturnType<typeof dayPart>, string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
  lateNight: "You're up late",
};

const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

/** The spoken briefing: greeting and time, weather, timers, then anything wrong with the PC. */
export function buildBriefing(b: BriefingInput): string {
  const d = new Date(b.now);
  const title = resolveTitle(b.personality.userTitle, b.userName);
  const terse = b.personality.verbosity <= 1;
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const parts: string[] = [];

  parts.push(
    terse
      ? `${time}.`
      : `${GREETING[dayPart(d.getHours())]}${title ? `, ${title}` : ''}. It's ${time} on ${d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}.`,
  );

  const w = b.weather;
  if (w) {
    const T = tempSymbol(w.units.temp);
    const cond = describeWeather(w.current.code, w.current.isDay).label.toLowerCase();
    const rain = rainSoon(w);
    const umbrella = rain !== null && rain >= 50;
    parts.push(
      terse
        ? `${Math.round(w.current.temp)}${T}, ${cond}.${umbrella ? ` Rain ${rain}%.` : ''}`
        : `In ${w.place.name} it's ${Math.round(w.current.temp)}${T} and ${cond}, with a high of ${Math.round(w.today.max)}${T} and a low of ${Math.round(w.today.min)}${T}.${
            umbrella
              ? ` There's a ${rain}% chance of rain in the next few hours, so take an umbrella.`
              : rain !== null && rain >= 25
                ? ` Possible showers later (${rain}%).`
                : ''
          }`,
    );
  } else if (!terse) {
    parts.push(
      b.weatherConfigured
        ? "I couldn't get the weather just now."
        : 'Add your town in Settings to get the weather here.',
    );
  }

  const ringing = b.timers.filter((t) => t.status === 'ringing');
  const running = b.timers.filter((t) => t.status === 'running').sort((x, y) => x.dueAt - y.dueAt);
  if (ringing.length) parts.push(`${plural(ringing.length, 'timer')} waiting to be dismissed.`);
  const next = running[0];
  if (next) {
    const mins = Math.max(1, Math.round((next.dueAt - b.now) / 60_000));
    parts.push(
      `${plural(running.length, 'timer')} running; ${next.label ? `“${next.label}”` : 'the next'} ends in ${plural(mins, 'minute')}.`,
    );
  }

  const s = b.stats;
  if (s) {
    const issues: string[] = [];
    for (const disk of s.disks) {
      const pct = disk.size > 0 ? (disk.used / disk.size) * 100 : 0;
      if (pct >= 90) issues.push(`drive ${disk.mount} is ${Math.round(pct)}% full`);
    }
    const mem = s.memory.total > 0 ? (s.memory.used / s.memory.total) * 100 : 0;
    if (mem >= 85) issues.push(`memory is ${Math.round(mem)}% used`);
    if ((s.cpu.temp ?? 0) >= 85)
      issues.push(`the processor is hot at ${Math.round(s.cpu.temp ?? 0)}°C`);
    if (s.battery && !s.battery.charging && s.battery.percent <= 20)
      issues.push(`the battery is at ${Math.round(s.battery.percent)}%`);
    const days = Math.floor(s.uptime / 86_400);
    if (days >= 7) issues.push(`it hasn't restarted in ${days} days, so a restart would help`);
    if (issues.length) {
      const list =
        issues.length === 1
          ? issues.join('')
          : `${issues.slice(0, -1).join(', ')} and ${issues.slice(-1).join('')}`;
      parts.push(`On your PC, ${list}.`);
    } else if (!terse) {
      parts.push('Your PC looks healthy.');
    }
  }
  return parts.join(' ');
}
