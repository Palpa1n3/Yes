import { describe, expect, it } from 'vitest';
import { projectMonth, spendLevel } from '@shared/usage';

describe('spending bar', () => {
  it('fills towards the limit and changes colour near it', () => {
    expect(spendLevel(2, 10)).toEqual({ pct: 20, tone: 'ok' });
    expect(spendLevel(8.5, 10).tone).toBe('warn');
    expect(spendLevel(12, 10)).toEqual({ pct: 100, tone: 'over' });
    expect(spendLevel(5, 0)).toEqual({ pct: 0, tone: 'ok' });
  });
  it('projects the month from the rate so far', () => {
    expect(projectMonth(3, new Date(2026, 10, 10))).toBeCloseTo(9);
  });
});
