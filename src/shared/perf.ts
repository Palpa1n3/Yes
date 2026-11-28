/** Performance benchmarking (Phase 3, item 9): Alton records how fast it really is in use, per
 *  version (start-up time, time to the first word of a reply, full reply time, memory and CPU),
 *  and compares each version with the one before, so a change that made it slower is noticed.
 *  Pure; tested in tests/perf.test.ts. */

export type PerfMetric = 'startupMs' | 'firstWordMs' | 'replyMs' | 'memoryMB' | 'cpuPct';

export const METRICS: Record<PerfMetric, { label: string; unit: string; lowerIsBetter: true }> = {
  startupMs: { label: 'Start-up', unit: 'ms', lowerIsBetter: true },
  firstWordMs: { label: 'First word of a reply', unit: 'ms', lowerIsBetter: true },
  replyMs: { label: 'Whole reply', unit: 'ms', lowerIsBetter: true },
  memoryMB: { label: 'Memory', unit: 'MB', lowerIsBetter: true },
  cpuPct: { label: 'CPU while idle', unit: '%', lowerIsBetter: true },
};

export interface PerfStore {
  /** version → metric → recent samples (oldest first). */
  versions: Record<string, Partial<Record<PerfMetric, number[]>>>;
  /** Versions in the order they were first seen. */
  order: string[];
}

export const emptyPerf = (): PerfStore => ({ versions: {}, order: [] });

const KEEP_SAMPLES = 60;
const KEEP_VERSIONS = 12;

export function addSample(
  s: PerfStore,
  version: string,
  metric: PerfMetric,
  value: number,
): PerfStore {
  if (!Number.isFinite(value) || value < 0) return s;
  const order = s.order.includes(version) ? s.order : [...s.order, version].slice(-KEEP_VERSIONS);
  const versions: PerfStore['versions'] = {};
  for (const v of order) versions[v] = s.versions[v] ?? {};
  const cur = versions[version] ?? {};
  versions[version] = { ...cur, [metric]: [...(cur[metric] ?? []), value].slice(-KEEP_SAMPLES) };
  return { versions, order };
}

const quantile = (xs: number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return (s[lo] ?? 0) + ((s[hi] ?? 0) - (s[lo] ?? 0)) * (i - lo);
};

export interface MetricSummary {
  metric: PerfMetric;
  label: string;
  unit: string;
  samples: number;
  /** The typical value (median). */
  median: number;
  /** A slow case (90th percentile). */
  p90: number;
}

export function summarise(s: PerfStore, version: string): MetricSummary[] {
  const v = s.versions[version] ?? {};
  return (Object.keys(METRICS) as PerfMetric[])
    .filter((m) => (v[m]?.length ?? 0) > 0)
    .map((m) => ({
      metric: m,
      label: METRICS[m].label,
      unit: METRICS[m].unit,
      samples: v[m]?.length ?? 0,
      median: Math.round(quantile(v[m] ?? [], 0.5) * 10) / 10,
      p90: Math.round(quantile(v[m] ?? [], 0.9) * 10) / 10,
    }));
}

export interface PerfChange {
  metric: PerfMetric;
  label: string;
  before: number;
  now: number;
  /** +25 = 25% higher (slower / more) than before. */
  changePct: number;
  verdict: 'slower' | 'faster' | 'same';
}

/** Minimum samples on both sides before a comparison counts. */
export const MIN_SAMPLES = 5;
/** How much worse (in %) counts as a slowdown worth reporting. */
export const SLOWER_PCT = 25;

export function compareVersions(s: PerfStore, before: string, now: string): PerfChange[] {
  const a = s.versions[before] ?? {};
  const b = s.versions[now] ?? {};
  const out: PerfChange[] = [];
  for (const m of Object.keys(METRICS) as PerfMetric[]) {
    const x = a[m] ?? [];
    const y = b[m] ?? [];
    if (x.length < MIN_SAMPLES || y.length < MIN_SAMPLES) continue;
    const mx = quantile(x, 0.5);
    const my = quantile(y, 0.5);
    if (mx <= 0) continue;
    const pct = Math.round(((my - mx) / mx) * 100);
    out.push({
      metric: m,
      label: METRICS[m].label,
      before: Math.round(mx * 10) / 10,
      now: Math.round(my * 10) / 10,
      changePct: pct,
      verdict: pct >= SLOWER_PCT ? 'slower' : pct <= -SLOWER_PCT ? 'faster' : 'same',
    });
  }
  return out;
}

/** The version before this one that has data (null if none). */
export function previousVersion(s: PerfStore, version: string): string | null {
  const i = s.order.indexOf(version);
  return i > 0 ? (s.order[i - 1] ?? null) : null;
}

/** One line about slowdowns (for the log / a notice), or null when nothing got slower. */
export function slowdownText(before: string, now: string, changes: PerfChange[]): string | null {
  const slow = changes.filter((c) => c.verdict === 'slower');
  if (!slow.length) return null;
  return `Performance: ${now} is slower than ${before}: ${slow
    .map((c) => `${c.label.toLowerCase()} ${c.before} → ${c.now} (+${c.changePct}%)`)
    .join('; ')}.`;
}
