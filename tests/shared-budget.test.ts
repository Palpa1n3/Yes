import { describe, expect, it } from 'vitest';
import { budgetBlock, sharedMonth, summarise, withPhoneDays, type DayUsage } from '@shared/usage';

const day = (d: string, usd: number, by: Record<string, number> = { chat: usd }): DayUsage => ({
  day: d,
  usd,
  requests: 1,
  by,
});

describe('one spending limit for the PC and the phone', () => {
  it('adds the phone’s days to the PC’s, as “phone”, without counting twice', () => {
    const pc = [day('2026-11-27', 1), day('2026-11-28', 0.5)];
    const phone = [day('2026-11-28', 0.25), day('2026-11-29', 0.1)];
    const both = withPhoneDays(pc, phone);
    expect(both.map((d) => [d.day, d.usd])).toEqual([
      ['2026-11-27', 1],
      ['2026-11-28', 0.75],
      ['2026-11-29', 0.1],
    ]);
    expect(both[1]?.by).toEqual({ chat: 0.5, phone: 0.25 });
    // Sending the same phone days again gives the same result.
    expect(withPhoneDays(pc, phone)).toEqual(both);
    const s = summarise(both, 10, new Date(2026, 10, 29));
    expect(s.byFeature.phone).toBeCloseTo(0.35);
  });

  it('works out the total on the phone between syncs', () => {
    const now = new Date(2026, 10, 28, 12);
    const synced = {
      month: 8,
      budget: 10,
      action: 'pause-all' as const,
      phoneMonthAtSync: 1,
      at: new Date(2026, 10, 27).getTime(),
    };
    expect(sharedMonth(synced, 1.5, now)).toBe(8.5);
    expect(sharedMonth(null, 1.5, now)).toBe(1.5);
    // Last sync was last month: only this month's own spending counts.
    expect(sharedMonth({ ...synced, at: new Date(2026, 9, 30).getTime() }, 0.2, now)).toBe(0.2);
    expect(budgetBlock(sharedMonth(synced, 3, now), 10, 'pause-all', 'chat')).not.toBeNull();
  });
});
