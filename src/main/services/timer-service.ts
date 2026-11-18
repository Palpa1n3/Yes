/** Timers & reminders: persisted to userData/timers.json so they survive restarts.
 *  A due timer "rings" until dismissed or snoozed; one that came due while ARC was
 *  closed rings when ARC starts. Time comes from an injectable clock for tests. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TimerInfo } from '@shared/types';

export const MAX_TIMERS = 20;
export const MAX_MINUTES = 24 * 60;
/** Ringing timers older than this are cleared on startup instead of ringing again. */
const STALE_RING_MS = 12 * 3600_000;

export interface TimerServiceDeps {
  file?: string;
  now?: () => number;
  /** Every change (add, tick into ringing, dismiss...). */
  onChange(list: TimerInfo[]): void;
  /** A timer just started ringing. */
  onRing(timer: TimerInfo): void;
}

export function describeDuration(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)} second`;
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} hour`;
  return `${+minutes.toFixed(1)} minute`;
}

export class TimerService {
  private timers: TimerInfo[] = [];
  private handles = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly now: () => number;

  constructor(private readonly d: TimerServiceDeps) {
    this.now = d.now ?? Date.now;
  }

  list(): TimerInfo[] {
    return [...this.timers].sort(
      (a, b) =>
        Number(b.status === 'ringing') - Number(a.status === 'ringing') || a.dueAt - b.dueAt,
    );
  }

  /** Restore saved timers; anything already due rings now. */
  load(): void {
    let saved: unknown = [];
    try {
      if (this.d.file && existsSync(this.d.file))
        saved = JSON.parse(readFileSync(this.d.file, 'utf8'));
    } catch {
      saved = [];
    }
    const now = this.now();
    this.timers = (Array.isArray(saved) ? saved : [])
      .filter(
        (t): t is TimerInfo =>
          !!t &&
          typeof t.id === 'string' &&
          typeof t.dueAt === 'number' &&
          typeof t.durationMs === 'number',
      )
      .filter((t) => !(t.status === 'ringing' && now - t.dueAt > STALE_RING_MS))
      .slice(0, MAX_TIMERS);
    for (const t of this.timers) if (t.status === 'running') this.schedule(t);
    this.changed();
  }

  add(minutes: number, label = ''): TimerInfo {
    if (!(minutes > 0 && minutes <= MAX_MINUTES))
      throw new Error('Timers can be from a few seconds up to 24 hours.');
    if (this.timers.length >= MAX_TIMERS)
      throw new Error(`You already have ${MAX_TIMERS} timers. Cancel one first.`);
    const now = this.now();
    const durationMs = Math.round(minutes * 60_000);
    const t: TimerInfo = {
      id: `t${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      label: label.trim().slice(0, 120),
      durationMs,
      createdAt: now,
      dueAt: now + durationMs,
      status: 'running',
    };
    this.timers.push(t);
    this.schedule(t);
    this.changed();
    return t;
  }

  /** Remove a timer (running or ringing). */
  cancel(id: string): boolean {
    const had = this.timers.some((t) => t.id === id);
    this.clearHandle(id);
    this.timers = this.timers.filter((t) => t.id !== id);
    if (had) this.changed();
    return had;
  }

  /** Cancel by fuzzy label ("oven"), or everything with "all". Returns what was cancelled. */
  cancelMatching(query: string): TimerInfo[] {
    const q = query.trim().toLowerCase();
    const hits =
      q === '' || q === 'all'
        ? this.list()
        : this.timers.filter((t) => t.label.toLowerCase().includes(q));
    for (const t of hits) this.cancel(t.id);
    return hits;
  }

  dismiss(id: string): void {
    this.cancel(id);
  }

  /** Ringing → run again for `minutes`; running → add `minutes`. */
  snooze(id: string, minutes = 5): void {
    const t = this.timers.find((x) => x.id === id);
    if (!t) return;
    const ms = Math.round(minutes * 60_000);
    if (t.status === 'ringing') {
      t.status = 'running';
      t.dueAt = this.now() + ms;
      t.durationMs = ms;
      t.createdAt = this.now();
    } else {
      t.dueAt += ms;
      t.durationMs += ms;
    }
    this.clearHandle(id);
    this.schedule(t);
    this.changed();
  }

  dispose(): void {
    for (const h of this.handles.values()) clearTimeout(h);
    this.handles.clear();
  }

  private schedule(t: TimerInfo): void {
    this.clearHandle(t.id);
    const delay = Math.max(0, t.dueAt - this.now());
    this.handles.set(
      t.id,
      setTimeout(() => this.ring(t.id), Math.min(delay, 2 ** 31 - 1)),
    );
  }

  private ring(id: string): void {
    this.handles.delete(id);
    const t = this.timers.find((x) => x.id === id);
    if (!t || t.status !== 'running') return;
    t.status = 'ringing';
    this.changed();
    this.d.onRing({ ...t });
  }

  private clearHandle(id: string): void {
    const h = this.handles.get(id);
    if (h) clearTimeout(h);
    this.handles.delete(id);
  }

  private changed(): void {
    this.save();
    this.d.onChange(this.list());
  }

  private save(): void {
    if (!this.d.file) return;
    try {
      mkdirSync(dirname(this.d.file), { recursive: true });
      const tmp = `${this.d.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.timers));
      renameSync(tmp, this.d.file);
    } catch {
      /* non-fatal */
    }
  }
}
