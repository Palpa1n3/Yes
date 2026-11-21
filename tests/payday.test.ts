import { describe, expect, it } from 'vitest';
import { nextPayday, paydays, payPeriod, periodPay, ukTakeHome } from '../src/shared/shifts';

describe('paydays', () => {
  it('counts every 4 weeks both ways from a known payday', () => {
    expect(paydays('2026-12-11', 28, new Date(2026, 10, 1), new Date(2027, 1, 28))).toEqual([
      '2026-11-13',
      '2026-12-11',
      '2027-01-08',
      '2027-02-05',
    ]);
    expect(nextPayday('2026-12-11', 28, new Date(2026, 10, 21))).toBe('2026-12-11');
    expect(nextPayday('2026-12-11', 28, new Date(2026, 11, 12))).toBe('2027-01-08');
  });

  it('monthly paydays keep the date (or the month end)', () => {
    expect(paydays('2026-01-31', 0, new Date(2026, 1, 1), new Date(2026, 3, 30))).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('works out the pay period and what it pays', () => {
    const p = payPeriod('2026-12-11', 28, 7);
    expect(p).toEqual({ start: '2026-11-06', end: '2026-12-04' });
    const sh = (d: string) => ({ title: 'Tesco', start: `${d}T09:00`, end: `${d}T17:00` });
    const pay = periodPay(
      [sh('2026-11-05'), sh('2026-11-10'), sh('2026-12-03'), sh('2026-12-04')],
      p!,
      12.5,
      30,
    );
    expect(pay).toEqual({ hours: 15, gross: 187.5, shifts: 2 });
  });

  it('estimates UK take-home', () => {
    expect(ukTakeHome(800, 28)).toBe(800); // under the tax-free amount
    expect(ukTakeHome(1500, 28)).toBeCloseTo(1500 - (1500 - 12570 / 13) * 0.28, 2);
  });
});
