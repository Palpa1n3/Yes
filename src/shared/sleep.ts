/** Sleep planner for shift work: when to wind down and be in bed before a shift's alarm,
 *  a nap before night shifts, and short gaps between shifts (UK rules give 11 hours' rest).
 *  Pure helpers so the phone, its notifications and Claude all agree. */
import { alarmFor, shiftKind, type Shift, type ShiftAlarmRule } from './shifts';

export interface SleepOptions {
  /** Hours of sleep wanted (default 8). */
  hours: number;
  /** Minutes of wind-down before bed (no screens, lights low). */
  windDown: number;
  alarmRules: ShiftAlarmRule[];
  alarmLead: number;
  /** Minutes to get to work. */
  travel: number;
}

export interface SleepPlan {
  shift: Shift;
  kind: 'bed' | 'nap';
  /** Alarm (bed) or nap end. */
  wake: Date;
  /** In bed by (bed) or nap from (nap). */
  bed: Date;
  windDownAt: Date;
  /** Hours of sleep still possible if they went to bed right now (bed plans only). */
  ifNow: number;
}

export interface ShortGap {
  after: Shift;
  before: Shift;
  hours: number;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;
const at = (s: string): Date | null => {
  const m = ISO.exec(s);
  if (!m) return null;
  const d = new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
  return Number.isNaN(d.getTime()) ? null : d;
};
const p2 = (n: number): string => String(n).padStart(2, '0');
export const hhmm = (d: Date): string => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
const MIN = 60_000;

/** The sleep plan for one shift. */
export function planFor(s: Shift, o: SleepOptions, now = new Date()): SleepPlan | null {
  const start = at(s.start);
  if (!start) return null;
  if (shiftKind(s) === 'night') {
    // A 90-minute nap (one sleep cycle) ending an hour before leaving.
    const wake = new Date(start.getTime() - (Math.max(0, o.travel) + 60) * MIN);
    const bed = new Date(wake.getTime() - 90 * MIN);
    return {
      shift: s,
      kind: 'nap',
      wake,
      bed,
      windDownAt: new Date(bed.getTime() - 15 * MIN),
      ifNow: 0,
    };
  }
  const a = alarmFor(s, o.alarmRules, o.alarmLead);
  const wake = new Date(start);
  wake.setHours(a.hour, a.minute, 0, 0);
  if (wake > start) wake.setDate(wake.getDate() - 1);
  const hours = Math.min(12, Math.max(4, o.hours || 8));
  const bed = new Date(wake.getTime() - hours * 3_600_000);
  const ifNow = Math.max(0, Math.round(((wake.getTime() - now.getTime()) / 3_600_000) * 10) / 10);
  return {
    shift: s,
    kind: 'bed',
    wake,
    bed,
    windDownAt: new Date(bed.getTime() - Math.max(0, o.windDown) * MIN),
    ifNow,
  };
}

/** The plan for the next shift whose alarm (or nap) hasn't passed, within `withinHours`. */
export function nextSleep(
  shifts: Shift[],
  o: SleepOptions,
  now = new Date(),
  withinHours = 36,
): SleepPlan | null {
  const t = now.getTime();
  return (
    shifts
      .map((s) => planFor(s, o, now))
      .filter((p): p is SleepPlan => !!p && p.wake.getTime() > t)
      .filter((p) => p.wake.getTime() - t <= withinHours * 3_600_000)
      .sort((a, b) => a.wake.getTime() - b.wake.getTime())[0] ?? null
  );
}

/** One line for the Today card and Claude. */
export function sleepLine(p: SleepPlan, now = new Date()): string {
  const day = (d: Date): string => {
    const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const n = Math.round((b - a) / 86_400_000);
    return n === 0 ? '' : n === 1 ? ' tomorrow' : ` ${d.toLocaleDateString([], { weekday: 'long' })}`;
  };
  if (p.kind === 'nap')
    return `Night shift at ${p.shift.start.slice(11, 16)}: nap ${hhmm(p.bed)}–${hhmm(p.wake)}${day(p.bed)}.`;
  if (p.bed.getTime() <= now.getTime())
    return `Alarm ${hhmm(p.wake)}: go to bed now for about ${p.ifNow} h of sleep.`;
  return `Alarm ${hhmm(p.wake)}${day(p.wake)}: in bed by ${hhmm(p.bed)}${day(p.bed)}, wind down from ${hhmm(p.windDownAt)}.`;
}

/** Back-to-back shifts with less than `minRest` hours between them (default 11). */
export function shortGaps(shifts: Shift[], minRest = 11, now = new Date()): ShortGap[] {
  const list = shifts
    .map((s) => ({ s, a: at(s.start), b: at(s.end) }))
    .filter((x): x is { s: Shift; a: Date; b: Date } => !!x.a && !!x.b)
    .sort((x, y) => x.a.getTime() - y.a.getTime());
  const out: ShortGap[] = [];
  for (let i = 1; i < list.length; i++) {
    const prev = list[i - 1]!;
    const cur = list[i]!;
    if (cur.a.getTime() <= now.getTime()) continue;
    const hours = (cur.a.getTime() - prev.b.getTime()) / 3_600_000;
    if (hours >= 0 && hours < minRest)
      out.push({ after: prev.s, before: cur.s, hours: Math.round(hours * 10) / 10 });
  }
  return out;
}
