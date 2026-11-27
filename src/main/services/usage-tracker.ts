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
  type DayUsage,
  type Usage,
  type UsageSummary,
} from '@shared/usage';

export class UsageTracker {
  private days: DayUsage[] = [];

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
    } catch {
      /* fresh */
    }
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
    return summarise(this.days, this.d.budget(), this.now());
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
