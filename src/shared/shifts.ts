/** Work shifts read from a screenshot of the user's rota/shift app, turned into calendar
 *  entries: one .ics file with every shift (one tap imports them all), plus a Google
 *  Calendar link per shift. Pure helpers so they can be tested. */

export interface Shift {
  title: string;
  /** Local time, "2026-11-24T07:00". */
  start: string;
  end: string;
  location?: string;
  notes?: string;
}

export const MAX_SHIFTS = 31;
const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

function parts(s: string): Date | null {
  const m = s.match(ISO);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1, 6).map(Number) as [number, number, number, number, number];
  const date = new Date(y, mo - 1, d, h, mi);
  return Number.isNaN(date.getTime()) || date.getMonth() !== mo - 1 ? null : date;
}

const p2 = (n: number): string => String(n).padStart(2, '0');
const isoLocal = (d: Date): string =>
  `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;

/** Clean up what Claude read: valid times only, overnight shifts end the next day,
 *  duplicates dropped, sorted by start. */
export function cleanShifts(raw: unknown, defaultTitle = 'Work'): Shift[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Shift[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const str = (k: string, max: number): string =>
      typeof o[k] === 'string' ? (o[k] as string).trim().slice(0, max) : '';
    const start = parts(str('start', 40));
    let end = parts(str('end', 40));
    if (!start || !end) continue;
    // "22:00–06:00" → ends the next morning.
    while (end <= start) end = new Date(end.getTime() + 24 * 3600_000);
    if (end.getTime() - start.getTime() > 24 * 3600_000) continue;
    const s: Shift = {
      title: str('title', 120) || defaultTitle,
      start: isoLocal(start),
      end: isoLocal(end),
    };
    const loc = str('location', 200);
    const notes = str('notes', 500);
    if (loc) s.location = loc;
    if (notes) s.notes = notes;
    const k = shiftKey(s);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out.sort((a, b) => a.start.localeCompare(b.start)).slice(0, MAX_SHIFTS);
}

/** Same shift = same start and end (the title may be read slightly differently). */
export const shiftKey = (s: Shift): string => `${s.start}/${s.end}`;

export function shiftHours(s: Shift): number {
  const a = parts(s.start);
  const b = parts(s.end);
  return a && b ? Math.round(((b.getTime() - a.getTime()) / 3600_000) * 100) / 100 : 0;
}

/** "Mon 24 Nov 07:00–15:00 (8h)". */
export function describeShift(s: Shift): string {
  const a = parts(s.start);
  if (!a) return s.start;
  const day = a.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} ${s.start.slice(11, 16)}–${s.end.slice(11, 16)} (${shiftHours(s)}h)`;
}

const icsText = (t: string): string =>
  t
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');
const icsTime = (s: string): string => `${s.replace(/[-:]/g, '').slice(0, 13)}00`;

/** Lines over 75 characters are folded (continuation lines start with a space). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

/** An iCalendar file with every shift. Times are "floating" (the phone's own time zone).
 *  UIDs come from the shift times, so importing the same rota twice updates instead of
 *  doubling up in most calendar apps. */
export function buildIcs(shifts: Shift[], reminderMinutes = 0, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Alton//Shifts//EN', 'METHOD:PUBLISH'];
  for (const s of shifts) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:shift-${icsTime(s.start)}-${icsTime(s.end)}@alton`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsTime(s.start)}`,
      `DTEND:${icsTime(s.end)}`,
      `SUMMARY:${icsText(s.title)}`,
    );
    if (s.location) lines.push(`LOCATION:${icsText(s.location)}`);
    if (s.notes) lines.push(`DESCRIPTION:${icsText(s.notes)}`);
    if (reminderMinutes > 0)
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${icsText(s.title)}`,
        `TRIGGER:-PT${Math.round(reminderMinutes)}M`,
        'END:VALARM',
      );
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/* ── Alarms for shifts ── */

/** "07:00 start → 05:45 alarm": exact alarm times for usual start times. */
export interface ShiftAlarmRule {
  start: string;
  alarm: string;
}

const HHMM = /^([01]?\d|2[0-3])[:.]([0-5]\d)$/;
const normTime = (t: string): string | null => {
  const m = t.trim().match(HHMM);
  return m ? `${p2(Number(m[1]))}:${m[2]}` : null;
};

/** "07:00=05:45, 12:00 = 10:00" (or "7:00>5:45" / "07:00 → 05:45") → rules. */
export function parseAlarmRules(text: string): ShiftAlarmRule[] {
  const out: ShiftAlarmRule[] = [];
  for (const part of text.split(/[,;\n]+/)) {
    const m = part.split(/\s*(?:=|→|->|>)\s*/);
    if (m.length !== 2) continue;
    const start = normTime(m[0] ?? '');
    const alarm = normTime(m[1] ?? '');
    if (start && alarm && !out.some((r) => r.start === start)) out.push({ start, alarm });
  }
  return out.slice(0, 12);
}

export const formatAlarmRules = (r: ShiftAlarmRule[]): string =>
  r.map((x) => `${x.start}=${x.alarm}`).join(', ');

/** The wake-up time for a shift: its rule, else `leadMinutes` before the start. */
export function alarmFor(
  s: Shift,
  rules: ShiftAlarmRule[],
  leadMinutes: number,
): { hour: number; minute: number; time: string } {
  const rule = rules.find((r) => r.start === s.start.slice(11, 16));
  let time = rule?.alarm;
  if (!time) {
    const d = parts(s.start) ?? new Date();
    d.setMinutes(d.getMinutes() - Math.max(0, leadMinutes));
    time = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }
  const [h, m] = time.split(':').map(Number) as [number, number];
  return { hour: h, minute: m, time };
}

/** The next shift starting within `withinHours`, and whether it's today or tomorrow. */
export function nextShift(
  shifts: Shift[],
  now = new Date(),
  withinHours = 36,
): { shift: Shift; when: 'today' | 'tomorrow' | 'later' } | null {
  const soon = shifts
    .map((s) => ({ s, at: parts(s.start) }))
    .filter((x): x is { s: Shift; at: Date } => !!x.at && x.at > now)
    .filter((x) => x.at.getTime() - now.getTime() <= withinHours * 3600_000)
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
  if (!soon) return null;
  const day = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(soon.at) - day(now)) / 86_400_000);
  return { shift: soon.s, when: diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : 'later' };
}

/** "5:45 a.m." for speaking to Alexa. */
export function spokenTime(time: string): string {
  const [h = 0, m = 0] = time.split(':').map(Number);
  const h12 = h % 12 || 12;
  return `${h12}${m ? `:${p2(m)}` : ''} ${h < 12 ? 'a.m.' : 'p.m.'}`;
}

/** Shifts still to come (or under way), soonest first. */
export const upcomingShifts = (shifts: Shift[], now = new Date()): Shift[] =>
  shifts
    .filter((s) => (parts(s.end)?.getTime() ?? 0) > now.getTime())
    .sort((a, b) => a.start.localeCompare(b.start));

/** Hours in the Monday–Sunday week containing `day`. */
export function weekHours(shifts: Shift[], day = new Date()): number {
  const mon = new Date(day.getFullYear(), day.getMonth(), day.getDate() - ((day.getDay() + 6) % 7));
  const next = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7);
  const h = shifts
    .filter((s) => {
      const a = parts(s.start);
      return !!a && a >= mon && a < next;
    })
    .reduce((n, s) => n + shiftHours(s), 0);
  return Math.round(h * 100) / 100;
}

/** Keep saved shifts tidy: newer copies replace older ones, old ones (over 5 weeks ago) go. */
export function mergeShifts(saved: Shift[], incoming: Shift[], now = new Date()): Shift[] {
  const byKey = new Map(saved.map((s) => [shiftKey(s), s]));
  for (const s of incoming) byKey.set(shiftKey(s), s);
  const cutoff = now.getTime() - 35 * 86_400_000;
  return [...byKey.values()]
    .filter((s) => (parts(s.end)?.getTime() ?? 0) > cutoff)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(-120);
}

/** Paid hours for a shift after an unpaid break (breaks only on shifts over 6 hours). */
export function paidHours(s: Shift, unpaidBreakMin = 0): number {
  const h = shiftHours(s);
  return h > 6 && unpaidBreakMin > 0 ? Math.max(0, h - unpaidBreakMin / 60) : h;
}

/** Estimated pay for the Monday–Sunday week containing `day`. */
export function weekPay(
  shifts: Shift[],
  rate: number,
  unpaidBreakMin = 0,
  day = new Date(),
): number {
  if (!(rate > 0)) return 0;
  const mon = new Date(day.getFullYear(), day.getMonth(), day.getDate() - ((day.getDay() + 6) % 7));
  const next = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7);
  const total = shifts
    .filter((s) => {
      const a = parts(s.start);
      return !!a && a >= mon && a < next;
    })
    .reduce((n, s) => n + paidHours(s, unpaidBreakMin) * rate, 0);
  return Math.round(total * 100) / 100;
}

/** "Leave by" time: the shift start minus travel minutes. */
export function leaveBy(s: Shift, travelMin: number): string {
  const d = parts(s.start);
  if (!d || !(travelMin > 0)) return '';
  d.setMinutes(d.getMinutes() - travelMin);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/* ── Rota changes: compare a new rota with the shifts already saved ── */

export interface RotaChanges {
  added: Shift[];
  removed: Shift[];
  changed: Array<{ from: Shift; to: Shift }>;
}

const dayOf = (s: Shift): string => s.start.slice(0, 10);

/** What a new rota changes, only within the days it covers (first to last shift day). */
export function rotaChanges(saved: Shift[], incoming: Shift[]): RotaChanges {
  const out: RotaChanges = { added: [], removed: [], changed: [] };
  if (!incoming.length) return out;
  const days = incoming.map(dayOf).sort();
  const first = days[0] ?? '';
  const last = days[days.length - 1] ?? '';
  const inRange = saved.filter((s) => dayOf(s) >= first && dayOf(s) <= last);
  const keys = new Set(incoming.map(shiftKey));
  const savedKeys = new Set(inRange.map(shiftKey));
  const gone = inRange.filter((s) => !keys.has(shiftKey(s)));
  const fresh = incoming.filter((s) => !savedKeys.has(shiftKey(s)));
  for (const f of fresh) {
    const i = gone.findIndex((g) => dayOf(g) === dayOf(f));
    if (i >= 0) {
      out.changed.push({ from: gone[i] as Shift, to: f });
      gone.splice(i, 1);
    } else out.added.push(f);
  }
  out.removed = gone;
  return out;
}

/** Replace the saved shifts on the days a new rota covers with that rota. */
export function replaceRota(saved: Shift[], incoming: Shift[], now = new Date()): Shift[] {
  if (!incoming.length) return saved;
  const days = incoming.map(dayOf).sort();
  const first = days[0] ?? '';
  const last = days[days.length - 1] ?? '';
  return mergeShifts(
    saved.filter((s) => dayOf(s) < first || dayOf(s) > last),
    incoming,
    now,
  );
}

/** The shift under way right now, if any. */
export function currentShift(shifts: Shift[], now = new Date()): Shift | null {
  return (
    shifts.find((s) => {
      const a = parts(s.start);
      const b = parts(s.end);
      return !!a && !!b && a <= now && now < b;
    }) ?? null
  );
}

/** "Home by" time: the shift end plus travel minutes ('' without travel). */
export function homeBy(s: Shift, travelMin: number): string {
  const d = parts(s.end);
  if (!d || !(travelMin > 0)) return '';
  d.setMinutes(d.getMinutes() + travelMin);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** Time left until a shift ends: "2h 10m" or "25m". */
export function timeLeft(s: Shift, now = new Date()): string {
  const b = parts(s.end);
  if (!b) return '';
  const m = Math.max(0, Math.round((b.getTime() - now.getTime()) / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${p2(m % 60)}m` : `${m}m`;
}

/* ── Shifts tab: kinds, month calendar, calendar import, sharing ── */

export type ShiftKind = 'early' | 'day' | 'late' | 'night';
export const SHIFT_KIND_LABEL: Record<ShiftKind, string> = {
  early: 'Early',
  day: 'Day',
  late: 'Late',
  night: 'Night',
};

/** Early (before 9), day (9–1), late (1pm–8pm) or night (8pm–4am) by start time. */
export function shiftKind(s: Shift): ShiftKind {
  const h = Number(s.start.slice(11, 13));
  if (!Number.isFinite(h)) return 'day';
  if (h < 4 || h >= 20) return 'night';
  if (h < 9) return 'early';
  if (h < 13) return 'day';
  return 'late';
}

/** "2026-11-24" for a local date. */
export const ymd = (d: Date): string =>
  `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

export interface MonthDay {
  date: string;
  day: number;
  inMonth: boolean;
  shifts: Shift[];
}

/** A Monday-first calendar for a month: whole weeks, each day with its shifts. */
export function monthGrid(year: number, month: number, shifts: Shift[]): MonthDay[][] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  const byDay = new Map<string, Shift[]>();
  for (const s of shifts) {
    const k = dayOf(s);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  const weeks: MonthDay[][] = [];
  const d = new Date(start);
  while (weeks.length < 6) {
    const week: MonthDay[] = [];
    for (let i = 0; i < 7; i++) {
      const k = ymd(d);
      week.push({
        date: k,
        day: d.getDate(),
        inMonth: d.getMonth() === month,
        shifts: byDay.get(k) ?? [],
      });
      d.setDate(d.getDate() + 1);
    }
    weeks.push(week);
    if (d.getMonth() !== month) break;
  }
  return weeks;
}

/** Hours in a calendar month. */
export function monthHours(shifts: Shift[], year: number, month: number): number {
  const pre = `${year}-${p2(month + 1)}-`;
  const h = shifts.filter((s) => s.start.startsWith(pre)).reduce((n, s) => n + shiftHours(s), 0);
  return Math.round(h * 100) / 100;
}

/** Days with no shift in the next `days` days (today included). */
export function daysOff(shifts: Shift[], days = 14, now = new Date()): number {
  const worked = new Set(shifts.map(dayOf));
  let n = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (!worked.has(ymd(d))) n++;
  }
  return n;
}

/** Calendar events that look like shifts (title has one of the words) turned into shifts. */
export function shiftsFromCalendar(
  events: Array<{ title: string; start: number; end: number; allDay: boolean; location?: string }>,
  words: string,
): Shift[] {
  const keys = words
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
  if (!keys.length) return [];
  return events
    .filter((e) => !e.allDay && e.end > e.start && e.end - e.start <= 16 * 3600_000)
    .filter((e) => keys.some((k) => e.title.toLowerCase().includes(k)))
    .map((e) => ({
      title: e.title.trim() || 'Work',
      start: isoLocal(new Date(e.start)),
      end: isoLocal(new Date(e.end)),
      ...(e.location ? { location: e.location } : {}),
    }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** A shift typed in by hand: date "2026-11-24", times "07:00"/"15:00" (an end before the start is the next day). */
export function manualShift(date: string, from: string, to: string, title = 'Work'): Shift | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to))
    return null;
  if (from === to) return null;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const endDay = to < from ? ymd(new Date(y, m - 1, d + 1)) : date;
  return { title: title.trim() || 'Work', start: `${date}T${from}`, end: `${endDay}T${to}` };
}

/** The rota as plain text to share: one line per shift. */
export function rotaText(shifts: Shift[], now = new Date()): string {
  const up = upcomingShifts(shifts, now);
  if (!up.length) return 'No shifts coming up.';
  return ['My shifts:', ...up.map((s) => `• ${describeShift(s)} ${s.title}`)].join('\n');
}
