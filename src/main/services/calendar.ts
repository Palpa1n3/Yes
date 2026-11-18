/** Reads a calendar from its private iCal address (fetched in main; the address is a
 *  secret), expands repeating events into the coming fortnight, refreshes every 10
 *  minutes and raises a reminder shortly before timed events. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import ICAL from 'ical.js';
import type { CalEvent, CalendarState } from '@shared/calendar';

export const REFRESH_MS = 10 * 60_000;
const DAY = 86_400_000;
const MAX_OCCURRENCES = 500;

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** Occurrences between `from` and `to` (epoch ms), sorted by start. */
export function parseIcs(text: string, from: number, to: number): CalEvent[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents('vtimezone'))
    ICAL.TimezoneService.register(new ICAL.Timezone(tz));

  // Group by UID: the main event plus any one-off changes to single occurrences.
  const byUid = new Map<string, { master?: ICAL.Event; exceptions: ICAL.Event[] }>();
  for (const v of root.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(v);
    const g = byUid.get(ev.uid) ?? { exceptions: [] };
    if (ev.isRecurrenceException()) g.exceptions.push(ev);
    else g.master = ev;
    byUid.set(ev.uid, g);
  }

  const out: CalEvent[] = [];
  const add = (uid: string, item: ICAL.Event, start: ICAL.Time, end: ICAL.Time | null): void => {
    const status = String(item.component.getFirstPropertyValue('status') ?? '').toUpperCase();
    if (status === 'CANCELLED') return;
    const s = start.toJSDate().getTime();
    const allDay = start.isDate;
    const e = end ? end.toJSDate().getTime() : s + (allDay ? DAY : 60 * 60_000);
    if (e <= from || s >= to) return;
    const location = String(item.location ?? '').trim();
    out.push({
      id: `${uid}@${s}`,
      title: String(item.summary ?? '').trim() || '(No title)',
      start: s,
      end: Math.max(e, s),
      allDay,
      ...(location ? { location: location.slice(0, 120) } : {}),
    });
  };

  for (const [uid, g] of byUid) {
    const master = g.master;
    if (!master) {
      for (const ex of g.exceptions) add(uid, ex, ex.startDate, ex.endDate);
      continue;
    }
    for (const ex of g.exceptions) master.relateException(ex);
    if (!master.isRecurring()) {
      add(uid, master, master.startDate, master.endDate);
      continue;
    }
    const it = master.iterator();
    for (let i = 0, next = it.next(); next && i < MAX_OCCURRENCES; i++, next = it.next()) {
      if (next.toJSDate().getTime() >= to) break;
      const d = master.getOccurrenceDetails(next);
      add(uid, d.item, d.startDate, d.endDate);
    }
  }
  return out.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
}

export interface CalendarDeps {
  fetch: Fetch;
  getUrl(): Promise<string | null>;
  /** Whether an address is saved (cheap, synchronous). */
  hasUrl?(): boolean;
  file?: string;
  now?: () => number;
  onChange(s: CalendarState): void;
  /** A timed event starts in about `minutes` minutes. */
  onReminder?(e: CalEvent, minutes: number): void;
  remindMinutes?(): number | null;
}

export class CalendarService {
  private events: CalEvent[] = [];
  private fetchedAt: number | null = null;
  private error: string | null = null;
  private configured = false;
  private inflight: Promise<void> | null = null;
  private reminded = new Set<string>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private readonly now: () => number;

  constructor(private readonly d: CalendarDeps) {
    this.now = d.now ?? Date.now;
    this.configured = d.hasUrl?.() ?? false;
    try {
      if (d.file && existsSync(d.file)) {
        const saved = JSON.parse(readFileSync(d.file, 'utf8')) as {
          events?: CalEvent[];
          fetchedAt?: number;
        };
        if (Array.isArray(saved.events)) this.events = saved.events;
        this.fetchedAt = saved.fetchedAt ?? null;
      }
    } catch {
      /* start empty */
    }
  }

  state(): CalendarState {
    const now = this.now();
    return {
      configured: this.configured,
      events: this.configured ? this.events.filter((e) => e.end > now - DAY) : [],
      fetchedAt: this.configured ? this.fetchedAt : null,
      error: this.error,
    };
  }

  /** Fetch and parse `url` (or the saved address). Throws with a plain message. */
  async load(url: string): Promise<CalEvent[]> {
    let res;
    try {
      res = await this.d.fetch(url);
    } catch (err) {
      throw new Error("Couldn't reach the calendar. Check your internet connection.", {
        cause: err,
      });
    }
    if (res.status === 404 || res.status === 403 || res.status === 401)
      throw new Error(
        'Google says that address is not valid any more. Copy the secret address again (it changes if you reset it).',
      );
    if (!res.ok) throw new Error(`The calendar server returned an error (${res.status}).`);
    const text = await res.text();
    if (!/BEGIN:VCALENDAR/i.test(text))
      throw new Error(
        "That address didn't return a calendar. Use the secret address in iCal format.",
      );
    const now = this.now();
    try {
      return parseIcs(text, now - DAY, now + 14 * DAY);
    } catch (err) {
      throw new Error('The calendar could not be read.', { cause: err });
    }
  }

  /** Refresh from the saved address. Never throws; errors go to state. */
  refresh(): Promise<void> {
    this.inflight ??= (async () => {
      try {
        const url = await this.d.getUrl();
        this.configured = !!url;
        if (!url) {
          this.events = [];
          this.error = null;
          return;
        }
        this.events = await this.load(url);
        this.fetchedAt = this.now();
        this.error = null;
        this.save();
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Calendar refresh failed.';
      } finally {
        this.inflight = null;
        this.d.onChange(this.state());
      }
    })();
    return this.inflight;
  }

  /** Called every ~30 s: reminders for timed events starting soon. */
  checkReminders(): void {
    const mins = this.d.remindMinutes?.() ?? null;
    if (!mins || !this.configured || !this.d.onReminder) return;
    const now = this.now();
    for (const e of this.events) {
      if (e.allDay || this.reminded.has(e.id)) continue;
      const until = e.start - now;
      if (until <= mins * 60_000 && until > -60_000) {
        this.reminded.add(e.id);
        this.d.onReminder(e, Math.max(0, Math.round(until / 60_000)));
      }
    }
  }

  start(): void {
    void this.refresh();
    this.timers.push(
      setInterval(() => void this.refresh(), REFRESH_MS),
      setInterval(() => this.checkReminders(), 30_000),
    );
    for (const t of this.timers) t.unref?.();
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  /** Forget everything (address removed). */
  clear(): void {
    this.configured = false;
    this.events = [];
    this.fetchedAt = null;
    this.error = null;
    this.save();
    this.d.onChange(this.state());
  }

  private save(): void {
    if (!this.d.file) return;
    try {
      mkdirSync(dirname(this.d.file), { recursive: true });
      const tmp = `${this.d.file}.tmp`;
      writeFileSync(tmp, JSON.stringify({ events: this.events, fetchedAt: this.fetchedAt }));
      renameSync(tmp, this.d.file);
    } catch {
      /* not fatal */
    }
  }
}
