/** Alton's one picture of what's going on right now, built from everything it already knows
 *  (the app in front, gaming, music, the next calendar event, unread email, timers, today's shift,
 *  the weather, its own jobs) and given to chat on every message, on the PC and the phone.
 *  Pure; tested in tests/context.test.ts. */

export interface NowFacts {
  now: number;
  /** "The user is in Chrome: “Inbox – Gmail”." */
  foreground?: string;
  gaming?: string | null;
  playing?: { title: string; artist: string; app: string } | null;
  nextEvent?: { title: string; start: number; location?: string } | null;
  unread?: { count: number; from: string[] } | null;
  timers?: Array<{ label: string; dueAt: number; kind?: string }>;
  shiftToday?: string | null;
  weather?: { label: string; temp: number; unit: string; rainSoonMin?: number | null } | null;
  /** What Alton itself is doing ("Agent Mode", "Updating mods"…). */
  jobs?: string[];
  /** Messages that came in on the phone. */
  phone?: string;
}

const mins = (ms: number): number => Math.max(0, Math.round(ms / 60_000));
const inTime = (ms: number): string => {
  const m = mins(ms);
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `in ${h} h${r ? ` ${r} min` : ''}`;
};

/** A short "right now" note (most useful first, at most ~700 characters). */
export function describeNow(f: NowFacts, clock: (ms: number) => string): string {
  const lines: string[] = [];
  if (f.foreground) lines.push(f.foreground);
  if (f.gaming) lines.push(`Gaming: ${f.gaming}.`);
  if (f.jobs?.length) lines.push(`Alton is busy with: ${[...new Set(f.jobs)].join(', ')}.`);
  if (f.nextEvent && f.nextEvent.start > f.now && f.nextEvent.start - f.now < 12 * 3600_000)
    lines.push(
      `Next in the calendar: “${f.nextEvent.title}” at ${clock(f.nextEvent.start)} (${inTime(f.nextEvent.start - f.now)})${
        f.nextEvent.location ? `, ${f.nextEvent.location}` : ''
      }.`,
    );
  if (f.shiftToday) lines.push(`Work today: ${f.shiftToday}.`);
  const timers = (f.timers ?? []).filter((t) => t.dueAt > f.now).sort((a, b) => a.dueAt - b.dueAt);
  if (timers.length)
    lines.push(
      `Timers: ${timers
        .slice(0, 3)
        .map(
          (t) =>
            `${t.label || (t.kind === 'focus' ? 'focus session' : 'timer')} ${inTime(t.dueAt - f.now)}`,
        )
        .join(', ')}.`,
    );
  if (f.unread && f.unread.count > 0)
    lines.push(
      `Unread email: ${f.unread.count}${f.unread.from.length ? ` (from ${f.unread.from.slice(0, 3).join(', ')})` : ''}.`,
    );
  if (f.playing)
    lines.push(
      `Playing: ${f.playing.title}${f.playing.artist ? ` by ${f.playing.artist}` : ''} (${f.playing.app}).`,
    );
  if (f.weather)
    lines.push(
      `Weather: ${f.weather.label}, ${Math.round(f.weather.temp)}${f.weather.unit}${
        typeof f.weather.rainSoonMin === 'number'
          ? `, rain in about ${f.weather.rainSoonMin} min`
          : ''
      }.`,
    );
  if (f.phone) lines.push(f.phone);
  if (!lines.length) return '';
  let out = `Right now (use only if relevant; don't list it back): ${lines.join(' ')}`;
  if (out.length > 700) out = `${out.slice(0, 697)}…`;
  return out;
}
