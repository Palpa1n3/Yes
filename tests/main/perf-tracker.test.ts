import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PerfTracker } from '../../src/main/services/perf-tracker';

describe('the performance record', () => {
  it('records per version, survives a restart, and reports a slowdown once', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'arc-perf-')), 'perf.json');
    let version = '1.8.0';
    const t = new PerfTracker({ file, version: () => version });
    for (let i = 0; i < 5; i++) t.record('firstWordMs', 800);
    t.save();
    version = '1.9.0';
    const again = new PerfTracker({ file, version: () => version });
    for (let i = 0; i < 5; i++) again.record('firstWordMs', 1200);
    expect(again.slowdown()).toBe(
      'Performance: 1.9.0 is slower than 1.8.0: first word of a reply 800 → 1200 (+50%).',
    );
    expect(again.slowdown()).toBeNull();
    expect(again.tool({}, () => [{ name: 'Tests', ms: 34_000 }])).toMatchObject({
      version: '1.9.0',
      comparedWith: '1.8.0',
      changes: [{ metric: 'firstWordMs', verdict: 'slower', changePct: 50 }],
      versionsRecorded: ['1.8.0', '1.9.0'],
      lastSelfTest: [{ name: 'Tests', ms: 34_000 }],
    });
  });

  it('says when there is nothing to compare with yet', () => {
    const t = new PerfTracker({ version: () => '1.0.0' });
    t.record('startupMs', 3000);
    expect(t.tool({})).toMatchObject({
      now: [{ metric: 'startupMs', median: 3000 }],
      note: expect.stringMatching(/No earlier version/),
    });
  });
});
