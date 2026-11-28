/** Habits: when the user first opens each app each day (to spot a regular routine worth
 *  automating), plus "remind me when I open X" reminders. Stored on this PC only. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { usualNow } from '@shared/initiative';

export interface FirstOpen {
  app: string;
  day: string; // YYYY-MM-DD
  minute: number; // minutes after midnight
}

export interface AppReminder {
  id: string;
  app: string;
  text: string;
  created: number;
}

/** Background and system processes that aren't "apps the user opened". */
const IGNORE =
  /^(explorer|searchhost|searchapp|shellexperiencehost|startmenuexperiencehost|lockapp|applicationframehost|textinputhost|electron|arc|alton|systemsettings|taskmgr|werfault|dwm|idle|)$/i;

const dayOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const fmtMinute = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;

/** Apps usually opened together at about the same time of day (≥3 of the last 10 days). */
export function findWorkflow(
  opens: FirstOpen[],
  today: Date,
  known: string[][] = [],
): { apps: string[]; minute: number } | null {
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 10);
  const recent = opens.filter((o) => o.day >= dayOf(cutoff));
  const byApp = new Map<string, FirstOpen[]>();
  for (const o of recent) byApp.set(o.app, [...(byApp.get(o.app) ?? []), o]);
  const regular: Array<{ app: string; minute: number }> = [];
  for (const [app, list] of byApp) {
    if (list.length < 3) continue;
    const mins = list.map((o) => o.minute).sort((a, b) => a - b);
    const median = mins[Math.floor(mins.length / 2)] ?? 0;
    const close = mins.filter((m) => Math.abs(m - median) <= 30).length;
    if (close >= 3 && close / mins.length >= 0.6) regular.push({ app, minute: median });
  }
  regular.sort((a, b) => a.minute - b.minute);
  for (let i = 0; i < regular.length; i++) {
    const first = regular[i];
    if (!first) continue;
    const group = regular.filter((r) => Math.abs(r.minute - first.minute) <= 20);
    if (group.length < 2) continue;
    const apps = group.map((g) => g.app).slice(0, 5);
    const lower = apps.map((a) => a.toLowerCase());
    if (known.some((k) => lower.every((a) => k.some((x) => x.toLowerCase().includes(a))))) continue;
    return { apps, minute: Math.round(group.reduce((n, g) => n + g.minute, 0) / group.length) };
  }
  return null;
}

export class Habits {
  private opens: FirstOpen[] = [];
  private reminders: AppReminder[] = [];

  constructor(
    private readonly file?: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    try {
      if (file && existsSync(file)) {
        const raw = JSON.parse(readFileSync(file, 'utf8')) as {
          opens?: FirstOpen[];
          reminders?: AppReminder[];
        };
        this.opens = Array.isArray(raw.opens) ? raw.opens : [];
        this.reminders = Array.isArray(raw.reminders) ? raw.reminders : [];
      }
    } catch {
      /* fresh */
    }
  }

  /** An app usually opened around now that hasn't been opened yet today. */
  usual(): { app: string; days: number } | null {
    return usualNow(this.opens, this.now());
  }

  /** The app in front changed. Returns reminders that are now due (and removes them). */
  seen(app: string): AppReminder[] {
    if (!app || IGNORE.test(app)) return [];
    const d = this.now();
    const day = dayOf(d);
    let changed = false;
    if (!this.opens.some((o) => o.app === app && o.day === day)) {
      this.opens = [...this.opens, { app, day, minute: d.getHours() * 60 + d.getMinutes() }].slice(
        -1500,
      );
      changed = true;
    }
    const a = app.toLowerCase();
    const due = this.reminders.filter((r) => {
      const want = r.app
        .toLowerCase()
        .replace(/\.exe$/, '')
        .replace(/\s+/g, '');
      return a.includes(want) || want.includes(a);
    });
    if (due.length) {
      this.reminders = this.reminders.filter((r) => !due.includes(r));
      changed = true;
    }
    if (changed) this.save();
    return due;
  }

  addReminder(app: string, text: string): AppReminder {
    const r = {
      id: `ar-${Date.now().toString(36)}`,
      app: app.slice(0, 60),
      text: text.slice(0, 300),
      created: Date.now(),
    };
    this.reminders = [...this.reminders, r].slice(-50);
    this.save();
    return r;
  }

  listReminders(): AppReminder[] {
    return this.reminders;
  }

  cancelReminder(match: string): number {
    const before = this.reminders.length;
    const m = match.toLowerCase();
    this.reminders = this.reminders.filter(
      (r) => !r.app.toLowerCase().includes(m) && !r.text.toLowerCase().includes(m),
    );
    this.save();
    return before - this.reminders.length;
  }

  workflow(known: string[][]): { apps: string[]; minute: number } | null {
    return findWorkflow(this.opens, this.now(), known);
  }

  private save(): void {
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(
        `${this.file}.tmp`,
        JSON.stringify({ opens: this.opens, reminders: this.reminders }),
      );
      renameSync(`${this.file}.tmp`, this.file);
    } catch {
      /* not fatal */
    }
  }
}
