import { describe, expect, it } from 'vitest';
import { healthReport } from '@shared/diagnostics';

describe('phone health check', () => {
  it('finds what slows a keyboard down and says how to fix it', () => {
    const now = Date.UTC(2026, 10, 21);
    const r = healthReport(
      {
        device: 'samsung SM-A166B',
        android: '15 (API 35)',
        uptimeHours: 24 * 9,
        memory: { totalGb: 4, freeGb: 0.3, low: true },
        storage: { totalGb: 128, freeGb: 6 },
        battery: { percent: 42, tempC: 31.5, charging: false, health: 'good' },
        powerSaving: true,
        animationScale: 1.5,
        keyboard: {
          name: 'Samsung Keyboard',
          version: '5.8',
          updated: now - 200 * 86_400_000,
          cacheMb: 320,
          dataMb: 90,
        },
      },
      now,
    );
    const what = r.issues.map((i) => i.what).join(' | ');
    expect(what).toMatch(/Not restarted for 9 days/);
    expect(what).toMatch(/Memory is nearly full/);
    expect(what).toMatch(/Storage is nearly full/);
    expect(what).toMatch(/Power saving/);
    expect(what).toMatch(/1.5×/);
    expect(what).toMatch(/Samsung Keyboard has built up/);
    expect(what).toMatch(/200 days/);
    expect(r.lines.join('\n')).toMatch(
      /Keyboard: Samsung Keyboard 5.8, updated 200 days ago, cache 320 MB/,
    );
  });
  it('is quiet when all is well', () => {
    const r = healthReport({
      uptimeHours: 20,
      memory: { totalGb: 8, freeGb: 3, low: false },
      storage: { totalGb: 128, freeGb: 60 },
      battery: { percent: 80, tempC: 28, charging: false, health: 'good' },
      powerSaving: false,
      thermal: 'normal',
    });
    expect(r.issues).toEqual([]);
    expect(r.lines.length).toBeGreaterThan(3);
  });
});
