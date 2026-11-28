/** Records what Claude costs, per day and per feature (userData/usage.json), and warns once
 *  when the month passes 80% and 100% of the user's limit. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  addUsage,
  budgetCrossed,
  budgetBlock,
  costOf,
  fmtUsd,
  summarise,
  withPhoneDays,
  type DayUsage,
  type Usage,
  type UsageSummary,
} from '@shared/usage';

export class UsageTracker {
  private days: DayUsage[] = [];
  /** What the phone spent, per day (sent with each phone sync; replaced, never added). */
  private phoneDays: DayUsage[] = [];

  constructor(
    private readonly d: {
      file?: string;
      budget(): number;
      action?(): 'warn' | 'pause-background' | 'pause-all';
      warn?(text: string): void;
      now?: () => Date;
    },
  ) {
    try {
      if (d.file && existsSync(d.file)) {
        const raw = JSON.parse(readFileSync(d.file, 'utf8')) as unknown;
        if (Array.isArray(raw)) this.days = raw as DayUsage[];
      }
      const pf = this.phoneFile();
      if (pf && existsSync(pf)) {
        const raw = JSON.parse(readFileSync(pf, 'utf8')) as unknown;
        if (Array.isArray(raw)) this.phoneDays = raw as DayUsage[];
      }
    } catch {
      /* fresh */
    }
  }

  private phoneFile(): string | null {
    return this.d.file ? this.d.file.replace(/\.json$/, '') + '-phone.json' : null;
  }

  /** The phone's own daily Claude costs, from a phone sync. Counted in the shared total and
   *  limit; warns if the phone's spending took the month past 80% or 100%. */
  setPhoneDays(days: unknown): void {
    if (!Array.isArray(days)) return;
    const clean = days
      .slice(-62)
      .filter(
        (x): x is DayUsage =>
          !!x &&
          typeof x === 'object' &&
          typeof (x as DayUsage).day === 'string' &&
          typeof (x as DayUsage).usd === 'number' &&
          Number.isFinite((x as DayUsage).usd) &&
          (x as DayUsage).usd >= 0 &&
          (x as DayUsage).usd < 10_000,
      )
      .map((x) => ({
        day: x.day.slice(0, 10),
        usd: x.usd,
        requests: typeof x.requests === 'number' ? Math.max(0, Math.round(x.requests)) : 0,
        by: {},
      }));
    const before = this.summary().month;
    this.phoneDays = clean;
    const after = this.summary().month;
    const crossed = budgetCrossed(before, after, this.d.budget());
    if (crossed)
      this.d.warn?.(
        crossed === 100
          ? `You've reached your Claude spending limit for this month (${fmtUsd(this.d.budget())}), counting the phone.`
          : `Heads up: with the phone included you've used 80% of this month's Claude limit (${fmtUsd(after)} of ${fmtUsd(this.d.budget())}).`,
      );
    const pf = this.phoneFile();
    if (!pf) return;
    try {
      mkdirSync(dirname(pf), { recursive: true });
      writeFileSync(`${pf}.tmp`, JSON.stringify(clean));
      renameSync(`${pf}.tmp`, pf);
    } catch {
      /* not fatal */
    }
  }

  /** What the phone needs to share the limit: this month's total (PC + phone), the limit, and what
   *  happens at the limit. */
  shared(): { month: number; budget: number; action: 'warn' | 'pause-background' | 'pause-all' } {
    return {
      month: this.summary().month,
      budget: this.d.budget(),
      action: this.d.action?.() ?? 'warn',
    };
  }

  private now(): Date {
    return this.d.now?.() ?? new Date();
  }

  /** One Claude request finished. Returns its estimated cost in dollars. */
  record(model: string, usage: Usage | null | undefined, feature: string): number {
    if (!usage) return 0;
    const usd = costOf(model, usage);
    const before = this.summary().month;
    this.days = addUsage(this.days, usd, feature, this.now());
    const after = this.summary().month;
    const crossed = budgetCrossed(before, after, this.d.budget());
    if (crossed)
      this.d.warn?.(
        crossed === 100
          ? `You've reached your Claude spending limit for this month (${fmtUsd(this.d.budget())}). Settings › AI shows the details.`
          : `Heads up: you've used 80% of this month's Claude limit (${fmtUsd(after)} of ${fmtUsd(this.d.budget())}).`,
      );
    this.save();
    return usd;
  }

  /** Is this feature paused by the monthly limit? The reason, or null to go ahead. */
  blocked(feature: string): string | null {
    return budgetBlock(this.summary().month, this.d.budget(), this.d.action?.() ?? 'warn', feature);
  }

  summary(): UsageSummary {
    return summarise(withPhoneDays(this.days, this.phoneDays), this.d.budget(), this.now());
  }

  private save(): void {
    if (!this.d.file) return;
    try {
      mkdirSync(dirname(this.d.file), { recursive: true });
      writeFileSync(`${this.d.file}.tmp`, JSON.stringify(this.days));
      renameSync(`${this.d.file}.tmp`, this.d.file);
    } catch {
      /* not fatal */
    }
  }
}
