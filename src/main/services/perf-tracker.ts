/** Records Alton's own performance per version (userData/perf.json; shared/perf.ts) and says
 *  when a version is clearly slower than the one before. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  addSample,
  compareVersions,
  emptyPerf,
  previousVersion,
  slowdownText,
  summarise,
  type PerfMetric,
  type PerfStore,
} from '@shared/perf';

export class PerfTracker {
  private s: PerfStore = emptyPerf();
  private dirty = false;
  /** Slowdowns already reported (one notice per version). */
  private told = new Set<string>();

  constructor(private readonly d: { file?: string; version: () => string }) {
    try {
      if (d.file && existsSync(d.file)) {
        const j = JSON.parse(readFileSync(d.file, 'utf8')) as Partial<PerfStore>;
        if (j.versions && Array.isArray(j.order)) this.s = { versions: j.versions, order: j.order };
      }
    } catch {
      /* fresh */
    }
  }

  record(metric: PerfMetric, value: number): void {
    this.s = addSample(this.s, this.d.version(), metric, value);
    this.dirty = true;
  }

  /** Written at most every few minutes (it's called often). */
  save(): void {
    if (!this.dirty || !this.d.file) return;
    try {
      mkdirSync(dirname(this.d.file), { recursive: true });
      writeFileSync(`${this.d.file}.tmp`, JSON.stringify(this.s));
      renameSync(`${this.d.file}.tmp`, this.d.file);
      this.dirty = false;
    } catch {
      /* not fatal */
    }
  }

  /** A slowdown against the previous version not reported yet, or null. */
  slowdown(): string | null {
    const now = this.d.version();
    const before = previousVersion(this.s, now);
    if (!before || this.told.has(now)) return null;
    const text = slowdownText(before, now, compareVersions(this.s, before, now));
    if (text) this.told.add(now);
    return text;
  }

  /** The alton_performance tool. */
  tool(input: unknown, selfTest?: () => Array<{ name: string; ms: number }> | null): unknown {
    const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    const now = this.d.version();
    const before =
      typeof o.against === 'string' && this.s.versions[o.against]
        ? o.against
        : previousVersion(this.s, now);
    return {
      version: now,
      now: summarise(this.s, now),
      ...(before
        ? { comparedWith: before, changes: compareVersions(this.s, before, now) }
        : { note: 'No earlier version recorded yet to compare with.' }),
      versionsRecorded: this.s.order,
      ...(selfTest?.() ? { lastSelfTest: selfTest() } : {}),
    };
  }
}
