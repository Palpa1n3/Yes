/** Independent initiative: small, rule-based suggestions Alton offers unprompted.
 *  Pure rules here (testable); main gathers the inputs and decides when to speak up. */
import type { CalEvent } from './calendar';
import { fmtTime } from './calendar';
import type { EmailSummary } from './email';
import { senderName } from './email';
import type { Routine } from './routines';
import type { RawIntent, SystemStats } from './types';
import type { WeatherData } from './weather';

export type SuggestionKind =
  'memory' | 'rain' | 'email' | 'evening' | 'error' | 'bugs' | 'workflow' | 'goal';

export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  text: string;
  /** One-tap action the user can accept. */
  action?: { label: string; intent: RawIntent };
  /** Or: accepting sends this to Alton as if the user had said it. */
  ask?: { label: string; text: string };
  at: number;
}

export interface InitiativeInput {
  now: Date;
  stats: SystemStats | null;
  events: CalEvent[] | null;
  weather: WeatherData | null;
  email: EmailSummary[];
  routines: Routine[];
  userName: string;
  /** The app in front (Windows). */
  foreground?: { app: string; title: string; fullscreen: boolean } | null;
  errorWindow?: boolean;
  /** Alton's own errors in the last hour. */
  recentErrors?: number;
  /** Apps the user regularly opens together at about the same time. */
  workflow?: { apps: string[]; minute: number } | null;
  /** Goals with no progress for a while. */
  staleGoal?: { title: string; days: number } | null;
}

/** Cooldown per kind before the same sort of suggestion can come again. */
export const COOLDOWN_MS: Record<SuggestionKind, number> = {
  memory: 3 * 3600_000,
  rain: 0, // once per event (by id)
  email: 0, // once per message (by id)
  evening: 20 * 3600_000,
  error: 30 * 60_000,
  bugs: 12 * 3600_000,
  workflow: 7 * 24 * 3600_000,
  goal: 3 * 24 * 3600_000,
};

/** Minimum gap between any two suggestions. */
export const MIN_GAP_MS = 20 * 60_000;

/** Is `hour` inside quiet hours start→end (wrapping past midnight)? Equal = never quiet. */
export function inQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

const GB = 1024 ** 3;

/** An app using a big share of memory while memory is nearly full. */
export function memoryRule(i: InitiativeInput): Suggestion | null {
  const s = i.stats;
  if (!s || !s.memory.total) return null;
  const used = s.memory.used / s.memory.total;
  if (used < 0.88) return null;
  const top = [...s.processes].sort((a, b) => b.mem - a.mem)[0];
  if (!top || top.mem / s.memory.total < 0.2) return null;
  const name = top.name.replace(/\.exe$/i, '');
  if (/^(system|memory compression|explorer|dwm|arc|electron)$/i.test(name)) return null;
  return {
    id: `memory-${name.toLowerCase()}`,
    kind: 'memory',
    text: `Memory is ${Math.round(used * 100)}% full and ${name} is using ${(top.mem / GB).toFixed(1)} GB of it. Want me to close it to speed things up?`,
    action: { label: `Close ${name}`, intent: { action: 'close_app', target: name } },
    at: i.now.getTime(),
  };
}

/** Rain likely around the start of an event in the next 3 hours. */
export function rainRule(i: InitiativeInput): Suggestion | null {
  if (!i.events || !i.weather) return null;
  const now = i.now.getTime();
  const soon = i.events.find(
    (e) => !e.allDay && e.start > now + 20 * 60_000 && e.start < now + 3 * 3600_000,
  );
  if (!soon) return null;
  const at = new Date(soon.start);
  const key = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}T${String(at.getHours()).padStart(2, '0')}`;
  const hour = i.weather.hourly.find((h) => h.time.startsWith(key));
  if (!hour || (hour.rainChance ?? 0) < 60) return null;
  return {
    id: `rain-${soon.id}`,
    kind: 'rain',
    text: `Heads up: ${soon.title} is at ${fmtTime(soon.start)} and there's a ${hour.rainChance}% chance of rain then. Might be worth taking a coat${soon.location ? ' or leaving a bit early' : ''}.`,
    at: now,
  };
}

const URGENT =
  /\b(urgent|asap|action required|immediately|overdue|final (notice|reminder)|deadline|due today|time.?sensitive|important)\b/i;
const NOISE = /\b(newsletter|unsubscribe|sale|% off|deal|offer|promo|webinar)\b/i;

/** A new unread email that looks important. */
export function emailRule(i: InitiativeInput): Suggestion | null {
  const now = i.now.getTime();
  const m = i.email.find(
    (e) =>
      e.unread && now - e.date < 6 * 3600_000 && URGENT.test(e.subject) && !NOISE.test(e.subject),
  );
  if (!m) return null;
  return {
    id: `email-${m.uid}`,
    kind: 'email',
    text: `${senderName(m.from)} sent an email that looks important: “${m.subject.slice(0, 90)}”. Say “read my latest emails” and I'll go through it.`,
    action: {
      label: 'Open Gmail',
      intent: { action: 'open_url', target: 'https://mail.google.com/' },
    },
    at: now,
  };
}

const EVENING_ROUTINE = /\b(night|evening|bed|sleep|wind.?down)/i;

/** Around 9:30pm: offer the evening routine, or a look at tomorrow. */
export function eveningRule(i: InitiativeInput): Suggestion | null {
  const h = i.now.getHours() + i.now.getMinutes() / 60;
  if (h < 21.5 || h >= 23) return null;
  const routine = i.routines.find((r) => EVENING_ROUTINE.test(r.name));
  const tomorrow = new Date(i.now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const first = i.events?.find(
    (e) => !e.allDay && e.start >= tomorrow.getTime() && e.start < tomorrow.getTime() + 86_400_000,
  );
  const plan = first
    ? ` Your first thing tomorrow is ${first.title} at ${fmtTime(first.start)}.`
    : '';
  const who = i.userName ? `, ${i.userName}` : '';
  if (routine)
    return {
      id: `evening-${i.now.toDateString()}`,
      kind: 'evening',
      text: `It's getting late${who}.${plan} Want me to run “${routine.name}”?`,
      action: {
        label: `Run ${routine.name}`,
        intent: { action: 'run_routine', target: routine.id },
      },
      at: i.now.getTime(),
    };
  if (!first) return null;
  const alarm = new Date(first.start - 90 * 60_000);
  return {
    id: `evening-${i.now.toDateString()}`,
    kind: 'evening',
    text: `It's getting late${who}.${plan} Want a reminder set for ${fmtTime(alarm.getTime())}?`,
    action: {
      label: 'Set reminder',
      intent: {
        action: 'set_timer',
        target: String(Math.max(1, Math.round((alarm.getTime() - i.now.getTime()) / 60_000))),
        args: [`Get ready for ${first.title}`],
      },
    },
    at: i.now.getTime(),
  };
}

/** An error or "not responding" pop-up is in front. */
export function errorDialogRule(i: InitiativeInput): Suggestion | null {
  const f = i.foreground;
  if (!f || !i.errorWindow) return null;
  return {
    id: `error-${f.app}-${f.title}`.slice(0, 120),
    kind: 'error',
    text: `That looks like an error${f.title ? ` (“${f.title.slice(0, 60)}”)` : ''}. Want me to take a look?`,
    ask: { label: 'Look at it', text: 'Look at my screen and help me with this error.' },
    at: i.now.getTime(),
  };
}

/** Alton itself has been hitting errors. */
export function bugRule(i: InitiativeInput): Suggestion | null {
  if ((i.recentErrors ?? 0) < 3) return null;
  return {
    id: `bugs-${i.now.toDateString()}-${i.now.getHours()}`,
    kind: 'bugs',
    text: `I've hit ${i.recentErrors} errors of my own in the last hour. Want me to check my logs and work out what's wrong?`,
    ask: {
      label: 'Debug yourself',
      text: 'Read your logs and tell me what is going wrong and how to fix it.',
    },
    at: i.now.getTime(),
  };
}

/** A regular routine of apps worth turning into one phrase. */
export function workflowRule(i: InitiativeInput): Suggestion | null {
  const w = i.workflow;
  if (!w) return null;
  const h = Math.floor(w.minute / 60);
  const m = String(w.minute % 60).padStart(2, '0');
  const list = w.apps.join(', ');
  return {
    id: `workflow-${w.apps.join('+').toLowerCase()}`,
    kind: 'workflow',
    text: `I've noticed you usually open ${list} around ${h}:${m}. Want me to make a routine that opens them all with one phrase?`,
    ask: {
      label: 'Make the routine',
      text: `Make a routine that opens ${list}, with a short phrase to run it, and tell me the phrase.`,
    },
    at: i.now.getTime(),
  };
}

/** A goal that hasn't moved in a while (once every few days, daytime only). */
export function goalRule(i: InitiativeInput): Suggestion | null {
  const g = i.staleGoal;
  const h = i.now.getHours();
  if (!g || h < 10 || h > 20) return null;
  return {
    id: `goal-${g.title}-${i.now.toDateString()}`,
    kind: 'goal',
    text: `Your goal “${g.title}” hasn't moved in ${g.days} days. Want to plan the next step together?`,
    ask: { label: 'Plan next step', text: `Help me plan the next step for my goal: ${g.title}.` },
    at: i.now.getTime(),
  };
}

/** Rules in priority order. */
export const RULES = [
  errorDialogRule,
  emailRule,
  rainRule,
  memoryRule,
  bugRule,
  eveningRule,
  workflowRule,
  goalRule,
];
