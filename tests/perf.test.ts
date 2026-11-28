import { describe, expect, it } from 'vitest';
import {
  addSample,
  compareVersions,
  emptyPerf,
  previousVersion,
  slowdownText,
  summarise,
  type PerfStore,
} from '@shared/perf';

const fill = (s: PerfStore, version: string, values: number[], metric = 'startupMs' as const) =>
  values.reduce((acc, v) => addSample(acc, version, metric, v), s);

describe('Alton’s own performance per version', () => {
  it('keeps samples per version and summarises them (median and slow cases)', () => {
    let s = fill(emptyPerf(), '1.8.0', [1000, 1100, 1200, 1300, 9000]);
    s = addSample(s, '1.8.0', 'memoryMB', 400);
    s = addSample(s, '1.8.0', 'replyMs', -5); // junk ignored
    expect(summarise(s, '1.8.0')).toEqual([
      { metric: 'startupMs', label: 'Start-up', unit: 'ms', samples: 5, median: 1200, p90: 5920 },
      { metric: 'memoryMB', label: 'Memory', unit: 'MB', samples: 1, median: 400, p90: 400 },
    ]);
    expect(s.order).toEqual(['1.8.0']);
  });

  it('compares a version with the one before, once there are enough samples', () => {
    let s = fill(emptyPerf(), '1.8.0', [1000, 1000, 1000, 1000, 1000]);
    s = fill(s, '1.9.0', [1300, 1300, 1300, 1300]);
    expect(compareVersions(s, '1.8.0', '1.9.0')).toEqual([]); // only 4 samples yet
    s = addSample(s, '1.9.0', 'startupMs', 1300);
    const c = compareVersions(s, '1.8.0', '1.9.0');
    expect(c).toEqual([
      {
        metric: 'startupMs',
        label: 'Start-up',
        before: 1000,
        now: 1300,
        changePct: 30,
        verdict: 'slower',
      },
    ]);
    expect(previousVersion(s, '1.9.0')).toBe('1.8.0');
    expect(previousVersion(s, '1.8.0')).toBeNull();
    expect(slowdownText('1.8.0', '1.9.0', c)).toBe(
      'Performance: 1.9.0 is slower than 1.8.0: start-up 1000 → 1300 (+30%).',
    );
    // A small change isn't a slowdown.
    const same = compareVersions(
      fill(s, '2.0.0', [1100, 1100, 1100, 1100, 1100]),
      '1.8.0',
      '2.0.0',
    );
    expect(same[0]?.verdict).toBe('same');
    expect(slowdownText('1.8.0', '2.0.0', same)).toBeNull();
  });

  it('keeps only recent versions and samples', () => {
    let s = emptyPerf();
    for (let v = 0; v < 15; v++) s = addSample(s, `1.${v}.0`, 'cpuPct', v);
    expect(s.order).toHaveLength(12);
    expect(s.order[0]).toBe('1.3.0');
    expect(Object.keys(s.versions)).toHaveLength(12);
    for (let i = 0; i < 100; i++) s = addSample(s, '1.14.0', 'cpuPct', i);
    expect(s.versions['1.14.0']?.cpuPct).toHaveLength(60);
  });
});
