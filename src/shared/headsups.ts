/** Watch heads-ups: notifications the phone app schedules so a paired watch (e.g. a Fitbit)
 *  buzzes at the right moments: the evening before a shift, time to leave, and a morning summary. */
import { alarmFor, type Shift, type ShiftAlarmRule } from './shifts';
import { hhmm as hm2, planFor, shortGaps, type SleepOptions } from './sleep';

export interface HeadsUpOptions {
  shiftEve: boolean;
  eveHour: number;
  leave: boolean;
  /** Minutes to get to work (0 = no "time to leave"). */
  travel: number;
  morning: boolean;
  morningHour: number;
  alarmRules: ShiftAlarmRule[];
  alarmLead: number;
  /** Sleep planner: a wind-down nudge before each shift's bedtime (or nap), and a warning the
   *  evening before a short gap between shifts. Off when missing. */
  sleep?: Omit<SleepOptions, 'alarmRules' | 'alarmLead' | 'travel'>;
}

export interface HeadsUp {
  /** Stable per moment (so re-scheduling replaces rather than repeats). */
  key: string;
  at: number;
  title: string;
  body: string;
}

const p2 = (n: number): string => String(n).padStart(2, '0');
const hm = (d: Date): string => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
const dayKey = (d: Date): string => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const local = (s: string): Date | null => {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function planHeadsUps(
  shifts: Shift[],
  o: HeadsUpOptions,
  now: Date = new Date(),
  extra: {
    /** Forecast per day ("2026-11-22" → "light rain, 4–9°C"). */
    forecast?: Record<string, string>;
    /** Calendar events (not shifts) in the next few days. */
    events?: Array<{ title: string; start: number; allDay?: boolean }>;
  } = {},
): HeadsUp[] {
  const out: HeadsUp[] = [];
  const t0 = now.getTime();
  const week = t0 + 7 * 86_400_000;
  for (const s of shifts) {
    const start = local(s.start);
    const end = local(s.end);
    if (!start || !end || start.getTime() <= t0 || start.getTime() > week) continue;
    if (o.shiftEve) {
      const at = new Date(start);
      at.setDate(at.getDate() - 1);
      at.setHours(o.eveHour, 0, 0, 0);
      if (at.getTime() > t0) {
        const a = alarmFor(s, o.alarmRules, o.alarmLead);
        out.push({
          key: `eve:${s.start}`,
          at: at.getTime(),
          title: `Tomorrow: ${s.title}`,
          body: `${hm(start)}–${hm(end)} · alarm ${a.time}${o.travel > 0 ? ` · leave by ${hm(new Date(start.getTime() - o.travel * 60_000))}` : ''}`,
        });
      }
    }
    if (o.leave && o.travel > 0) {
      const at = start.getTime() - (o.travel + 10) * 60_000;
      if (at > t0)
        out.push({
          key: `leave:${s.start}`,
          at,
          title: 'Leave in 10 minutes',
          body: `${s.title} at ${hm(start)} · ${o.travel} min journey`,
        });
    }
  }
  if (o.sleep) {
    const so: SleepOptions = {
      ...o.sleep,
      alarmRules: o.alarmRules,
      alarmLead: o.alarmLead,
      travel: o.travel,
    };
    for (const s of shifts) {
      const p = planFor(s, so, now);
      if (!p || p.windDownAt.getTime() <= t0 || p.windDownAt.getTime() > week) continue;
      out.push(
        p.kind === 'nap'
          ? {
              key: `sleep:${s.start}`,
              at: p.windDownAt.getTime(),
              title: 'Nap before your night shift',
              body: `Nap ${hm2(p.bed)}–${hm2(p.wake)} · shift ${s.start.slice(11, 16)}`,
            }
          : {
              key: `sleep:${s.start}`,
              at: p.windDownAt.getTime(),
              title: `Wind down: bed by ${hm2(p.bed)}`,
              body: `${o.sleep.hours} h before your ${hm2(p.wake)} alarm · ${s.title} ${s.start.slice(11, 16)}`,
            },
      );
    }
    for (const g of shortGaps(shifts, 11, now)) {
      const end = local(g.after.end);
      if (!end) continue;
      const when = new Date(end.getTime() - 60 * 60_000);
      if (when.getTime() <= t0 || when.getTime() > week) continue;
      out.push({
        key: `gap:${g.before.start}`,
        at: when.getTime(),
        title: `Only ${g.hours} h before your next shift`,
        body: `Finish ${g.after.end.slice(11, 16)}, back at ${g.before.start.slice(11, 16)}. Head straight home and to bed.`,
      });
    }
  }
  if (o.morning)
    for (let i = 0; i < 3; i++) {
      const at = new Date(now);
      at.setDate(at.getDate() + i);
      at.setHours(o.morningHour, 0, 0, 0);
      if (at.getTime() <= t0) continue;
      const day = dayKey(at);
      const parts: string[] = [];
      const shift = shifts.find((s) => s.start.slice(0, 10) === day);
      if (shift)
        parts.push(`${shift.title} ${shift.start.slice(11, 16)}–${shift.end.slice(11, 16)}`);
      const ev = (extra.events ?? [])
        .filter((e) => dayKey(new Date(e.start)) === day && e.title !== shift?.title)
        .sort((a, b) => a.start - b.start)[0];
      if (ev) parts.push(ev.allDay ? ev.title : `${hm(new Date(ev.start))} ${ev.title}`);
      const w = extra.forecast?.[day];
      if (w) parts.push(w);
      out.push({
        key: `morning:${day}`,
        at: at.getTime(),
        title: 'Good morning',
        body: parts.length ? parts.join(' · ') : 'Nothing in the calendar today.',
      });
    }
  return out.sort((a, b) => a.at - b.at).slice(0, 40);
}

/** A stable positive notification id for a key. */
export function noteId(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 1) % 2_000_000_000 || 1;
}
