/** Watch heads-ups: notifications the phone app schedules so a paired watch (e.g. a Fitbit
 *  Versa 2, which shows phone notifications) buzzes at the right moments. Each one is short,
 *  with the key information in the title: the evening before a shift, time to leave (with the
 *  weather for the trip), a morning summary, 30 minutes left and a break reminder during a
 *  shift, the end-of-shift summary, payday, and rota changes. */
import { alarmFor, type RotaChanges, type Shift, type ShiftAlarmRule } from './shifts';
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
  /** "30 min left · finish 18:45" before each shift ends. */
  shiftLeft?: boolean;
  /** "Break in 10 min": the usual break, minutes after the start (0 = off). */
  breakAfter?: number;
  /** Add the trip's weather to "Leave in 10 min". */
  leaveWeather?: boolean;
  /** "💷 Payday tomorrow ≈ £293" the evening before, and on the morning. */
  payday?: boolean;
  /** One end-of-shift note: tomorrow's shift, the shopping list and today's reminders (it
   *  replaces the separate "Before you leave" note), `endLead` minutes before the end. */
  summary?: boolean;
  endLead?: number;
}

/** An hour of forecast: start time (ms), chance of rain (%), °C and the weather code. */
export interface HourWeather {
  t: number;
  rain: number;
  temp: number;
  code: number;
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
const dow = (d: Date): string =>
  d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

/** The weather for a trip and the time away, in a few words: "rain from 17:00, take a coat".
 *  '' when nothing is worth saying. */
export function tripWeather(hours: HourWeather[], from: number, to: number): string {
  const inside = hours.filter((h) => h.t + 3_600_000 > from && h.t <= to);
  if (!inside.length) return '';
  const when = (t: number): string => (t <= from + 30 * 60_000 ? 'now' : `from ${hm(new Date(t))}`);
  const snow = inside.find((h) => SNOW_CODES.has(h.code));
  if (snow) return `snow ${when(snow.t)}, wrap up`;
  const rain = inside.find((h) => RAIN_CODES.has(h.code) || h.rain >= 60);
  if (rain) return `rain ${when(rain.t)}, take a coat`;
  const cold = Math.min(...inside.map((h) => h.temp));
  if (cold <= 2) return `${Math.round(cold)}°C, icy, wrap up`;
  return '';
}

/** Short notifications for a changed rota: one per shift (up to 3), else one summary. */
export function rotaChangeNotes(
  ch: RotaChanges,
): Array<{ key: string; title: string; body: string }> {
  const when = (s: Shift): string => `${s.start.slice(11, 16)}–${s.end.slice(11, 16)}`;
  const day = (s: Shift): string => dow(new Date(s.start));
  const notes = [
    ...ch.changed.map((c) => ({
      key: `rota:moved:${c.to.start}`,
      title: `${day(c.to)} shift moved: ${when(c.to)}`,
      body: `Was ${when(c.from)}`,
    })),
    ...ch.added.map((s) => ({
      key: `rota:new:${s.start}`,
      title: `New shift ${day(s)}: ${when(s)}`,
      body: s.title,
    })),
    ...ch.removed.map((s) => ({
      key: `rota:gone:${s.start}`,
      title: `${day(s)} shift removed`,
      body: `Was ${when(s)}`,
    })),
  ];
  if (notes.length <= 3) return notes;
  return [
    {
      key: `rota:many:${notes.map((n) => n.key).join('|')}`,
      title: `Rota changed: ${notes.length} shifts`,
      body: notes.map((n) => n.title).join(' · '),
    },
  ];
}

export function planHeadsUps(
  shifts: Shift[],
  o: HeadsUpOptions,
  now: Date = new Date(),
  extra: {
    /** Forecast per day ("2026-11-22" → "light rain, 4–9°C"). */
    forecast?: Record<string, string>;
    /** Calendar events (not shifts) in the next few days. */
    events?: Array<{ title: string; start: number; allDay?: boolean }>;
    /** Hourly forecast, for "Leave in 10 min · rain from 17:00". */
    hourly?: HourWeather[];
    /** The next payday ("2026-11-28") and roughly what it pays after tax (0 = unknown). */
    payday?: { date: string; net: number };
    /** For the end-of-shift note: the shopping list and reminders. */
    items?: string[];
    reminders?: Array<{ what: string; at: number }>;
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
      // The weather from leaving until home again.
      const wx =
        o.leaveWeather && extra.hourly
          ? tripWeather(extra.hourly, at, end.getTime() + o.travel * 60_000)
          : '';
      if (at > t0)
        out.push({
          key: `leave:${s.start}`,
          at,
          title: wx ? `Leave in 10 min · ${wx}` : 'Leave in 10 minutes',
          body: `${s.title} at ${hm(start)} · ${o.travel} min journey`,
        });
    }
  }
  // During a shift (including one already under way) and at its end.
  const sorted = [...shifts].sort((a, b) => a.start.localeCompare(b.start));
  for (const s of sorted) {
    const start = local(s.start);
    const end = local(s.end);
    if (!start || !end || end.getTime() <= t0 || start.getTime() > week) continue;
    const len = end.getTime() - start.getTime();
    if (o.shiftLeft && len > 60 * 60_000) {
      const at = end.getTime() - 30 * 60_000;
      if (at > t0)
        out.push({
          key: `left:${s.start}`,
          at,
          title: `30 min left · finish ${hm(end)}`,
          body: s.title,
        });
    }
    const brk = o.breakAfter ?? 0;
    if (brk > 0 && brk * 60_000 < len - 20 * 60_000) {
      const breakAt = start.getTime() + brk * 60_000;
      const at = breakAt - 10 * 60_000;
      if (at > t0)
        out.push({
          key: `break:${s.start}`,
          at,
          title: 'Break in 10 min',
          body: `${hm(new Date(breakAt))} · ${s.title}`,
        });
    }
    if (o.summary) {
      const at = end.getTime() - Math.max(0, o.endLead ?? 0) * 60_000;
      if (at > t0) {
        const next = sorted.find((x) => x.start > s.end);
        const nd = next ? local(next.start) : null;
        const tomorrow = new Date(end);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const nextTxt =
          !next || !nd
            ? 'no shift booked'
            : dayKey(nd) === dayKey(end)
              ? `next ${next.start.slice(11, 16)} today`
              : dayKey(nd) === dayKey(tomorrow)
                ? `tomorrow ${next.start.slice(11, 16)}–${next.end.slice(11, 16)}`
                : `next ${dow(nd)} ${next.start.slice(11, 16)}`;
        const midnight = new Date(end);
        midnight.setHours(23, 59, 59, 999);
        const rems = (extra.reminders ?? [])
          .filter((r) => r.at >= at && r.at <= midnight.getTime())
          .sort((a, b) => a.at - b.at)
          .slice(0, 3)
          .map((r) => `⏰ ${hm(new Date(r.at))} ${r.what}`);
        const items = extra.items ?? [];
        const parts = [items.length ? `🛒 ${items.slice(0, 8).join(', ')}` : '', ...rems].filter(
          Boolean,
        );
        out.push({
          key: `end:${s.start}`,
          at,
          title: `Shift done · ${nextTxt}`,
          body: parts.length ? parts.join('\n') : 'Nothing else today.',
        });
      }
    }
  }
  if (o.payday && extra.payday) {
    const pd = local(`${extra.payday.date}T00:00`);
    if (pd) {
      const amt = extra.payday.net > 0 ? ` ≈ £${Math.round(extra.payday.net)}` : '';
      const eve = new Date(pd);
      eve.setDate(eve.getDate() - 1);
      eve.setHours(o.eveHour, 0, 0, 0);
      const morning = new Date(pd);
      morning.setHours(o.morningHour, 0, 0, 0);
      if (eve.getTime() > t0 && eve.getTime() <= week)
        out.push({
          key: `payeve:${extra.payday.date}`,
          at: eve.getTime(),
          title: `💷 Payday tomorrow${amt}`,
          body: 'Paid into your account tomorrow',
        });
      if (morning.getTime() > t0 && morning.getTime() <= week)
        out.push({
          key: `payday:${extra.payday.date}`,
          at: morning.getTime(),
          title: `💷 Payday today${amt}`,
          body: 'Check your account',
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
  return out.sort((a, b) => a.at - b.at).slice(0, 60);
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
