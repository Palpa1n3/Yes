/** Calendar: read-only, from a calendar's private iCal address (Google Calendar's
 *  "Secret address in iCal format"). The address is a secret, kept encrypted in main. */

export interface CalEvent {
  /** Stable per occurrence: UID + start. */
  id: string;
  title: string;
  /** Epoch ms. All-day events start at local midnight. */
  start: number;
  end: number;
  allDay: boolean;
  location?: string;
}

export interface CalendarState {
  configured: boolean;
  /** Upcoming events (yesterday … two weeks ahead), sorted by start. */
  events: CalEvent[];
  fetchedAt: number | null;
  error: string | null;
}

export interface CalendarUrlResult {
  ok: boolean;
  message: string;
}

const dayKey = (t: number): string => new Date(t).toDateString();

/** Events happening on the given day (all-day ones included, ended ones too). */
export function eventsOn(events: readonly CalEvent[], day: number): CalEvent[] {
  const d0 = new Date(day);
  d0.setHours(0, 0, 0, 0);
  const d1 = new Date(d0);
  d1.setDate(d1.getDate() + 1);
  return events.filter((e) => e.start < d1.getTime() && e.end > d0.getTime());
}

/** The next timed event that hasn't started yet (or is in progress), if any. */
export function nextEvent(events: readonly CalEvent[], now: number): CalEvent | undefined {
  return events.find((e) => !e.allDay && e.end > now);
}

export function fmtTime(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** "Today", "Tomorrow", or "Friday 21 Nov". */
export function dayLabel(t: number, now: number): string {
  if (dayKey(t) === dayKey(now)) return 'Today';
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dayKey(t) === dayKey(tomorrow.getTime())) return 'Tomorrow';
  return new Date(t).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
}

/** "14:30–15:00 Dentist (High Street)" or "All day: Mum's birthday". */
export function describeEvent(e: CalEvent): string {
  const where = e.location ? ` (${e.location})` : '';
  return e.allDay
    ? `All day: ${e.title}${where}`
    : `${fmtTime(e.start)}–${fmtTime(e.end)} ${e.title}${where}`;
}

/** A spoken summary for the briefing: "You have 3 things today: …". */
export function agendaSentence(events: readonly CalEvent[], now: number, terse = false): string {
  const today = eventsOn(events, now).filter((e) => e.allDay || e.end > now);
  if (!today.length) {
    const next = events.find((e) => e.start > now);
    if (terse) return 'Calendar clear today.';
    return next
      ? `Your calendar is clear today; next up is ${next.title}, ${dayLabel(next.start, now).toLowerCase()}${next.allDay ? '' : ` at ${fmtTime(next.start)}`}.`
      : 'Your calendar is clear today.';
  }
  const parts = today
    .slice(0, 4)
    .map((e) => (e.allDay ? e.title : `${e.title} at ${fmtTime(e.start)}`));
  const more = today.length > 4 ? `, and ${today.length - 4} more` : '';
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts.slice(-1).join('')}`;
  return terse
    ? `Today: ${list}${more}.`
    : `You have ${today.length === 1 ? 'one thing' : `${today.length} things`} on today: ${list}${more}.`;
}

/** Accept https iCal addresses only (Google's look like
 *  https://calendar.google.com/calendar/ical/<id>/private-<key>/basic.ics). */
export function validCalendarUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim().replace(/^webcal:/i, 'https:'));
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (!/\.ics$/i.test(u.pathname) && !/ical/i.test(u.pathname)) return null;
  return u.toString();
}
