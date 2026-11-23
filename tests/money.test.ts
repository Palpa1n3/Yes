import { describe, expect, it } from 'vitest';
import {
  categoryOf,
  cleanPayslip,
  comparePayslip,
  extractPrice,
  findRecurring,
  priceDrop,
  spendingCheck,
  takeHomeRate,
} from '@shared/money';
import type { Payment } from '@shared/spending';

const shift = (d: string, from = '09:00', to = '17:00') => ({
  title: 'Work',
  start: `${d}T${from}`,
  end: `${d}T${to}`,
});
// Six 8-hour shifts = 48h (no unpaid break).
const rota = [
  '2026-11-02',
  '2026-11-04',
  '2026-11-06',
  '2026-11-09',
  '2026-11-11',
  '2026-11-13',
].map((d) => shift(d));
const slip = (over: Record<string, unknown> = {}) =>
  cleanPayslip({
    periodStart: '2026-11-01',
    periodEnd: '2026-11-14',
    payDate: '2026-11-20',
    hours: 46,
    rate: 12,
    gross: 552,
    tax: 30,
    ni: 12,
    net: 510,
    ...over,
  });

describe('payslip check', () => {
  it('spots hours missing from the payslip and writes the manager a line', () => {
    const s = slip();
    expect(s).not.toBeNull();
    const c = comparePayslip(s!, rota, { rate: 12, unpaidBreak: 0, breakOver: 6 });
    expect(c.rotaHours).toBe(48);
    expect(c.issues[0]).toBe('Payslip has 46h, your rota shows 48h: 2h ≈ £24.00 missing.');
    expect(c.ask).toMatch(/My rota shows 48 hours but my payslip has 46/);
  });
  it('is happy when it matches, and counts the unpaid break', () => {
    const c = comparePayslip(slip({ hours: 45, gross: 540, net: 498 })!, rota, {
      rate: 12,
      unpaidBreak: 30,
      breakOver: 6,
    });
    expect(c.rotaHours).toBe(45);
    expect(c.issues).toEqual([]);
    expect(c.ask).toBeNull();
  });
  it('flags a different rate and deductions that do not add up', () => {
    const c = comparePayslip(slip({ hours: 48, rate: 11.5, gross: 552, net: 480 })!, rota, {
      rate: 12,
      unpaidBreak: 0,
      breakOver: 6,
    });
    expect(c.issues.some((i) => i.includes('rate is £11.50/h'))).toBe(true);
    expect(c.issues.some((i) => i.includes('another deduction'))).toBe(true);
  });
  it('ignores junk and works out the real take-home share', () => {
    expect(cleanPayslip({ hours: 'lots' })).toBeNull();
    expect(takeHomeRate([])).toBeNull();
    expect(takeHomeRate([slip()!, slip({ gross: 600, net: 540 })!])).toBe(0.912);
  });
});

const DAY = 86_400_000;
const t0 = new Date(2026, 6, 1).getTime();
const pay = (merchant: string, amount: number, day: number): Payment => ({
  merchant,
  amount,
  kind: 'spend',
  at: t0 + day * DAY,
  app: 'Monzo',
});

describe('spending check', () => {
  const payments = [
    pay('Spotify', 11.99, 0),
    pay('Spotify', 11.99, 31),
    pay('Spotify', 12.99, 62),
    pay('Apple Music', 10.99, 5),
    pay('Apple Music', 10.99, 35),
    pay('Netflix', 4.99, 10),
    pay('Netflix', 4.99, 41),
    pay('Greggs', 3.2, 60),
    pay('Tesco', 40, 61),
    pay('Tesco', 12, 63),
    pay('Puregym', 25, 50),
  ];
  it('finds subscriptions and price rises', () => {
    const r = findRecurring(payments);
    expect(r.map((x) => x.merchant).sort()).toEqual(['Apple Music', 'Netflix', 'Spotify']);
    expect(r.find((x) => x.merchant === 'Spotify')?.rise).toEqual({ from: 11.99, to: 12.99 });
    expect(r.every((x) => x.every === 'month')).toBe(true);
  });
  it('groups this month by category and makes plain suggestions', () => {
    const c = spendingCheck(payments, t0 + 59 * DAY);
    expect(c.categories[0]).toEqual({ name: 'Groceries', total: 52 });
    expect(c.suggestions[0]).toMatch(/^You pay for 2 music apps \(Spotify, Apple Music\)/);
    expect(c.suggestions).toContain('Spotify went up from £11.99 to £12.99.');
    expect(categoryOf('GREGGS PLC')).toBe('Eating out');
    expect(categoryOf('Bob')).toBe('Other');
  });
});

describe('price watching', () => {
  it('reads prices from product pages', () => {
    expect(
      extractPrice('<script>{"@type":"Offer","priceCurrency":"GBP","price":"24.99"}</script>'),
    ).toBe(24.99);
    expect(extractPrice('<meta property="product:price:amount" content="199.00">')).toBe(199);
    expect(extractPrice('<span itemprop="price" content="7.5">£7.50</span>')).toBe(7.5);
    expect(extractPrice('<p>No price here</p>')).toBeNull();
  });
  it('only shouts about real drops', () => {
    expect(priceDrop({ name: 'Air fryer', price: 80 }, 79.9)).toBeNull();
    expect(priceDrop({ name: 'Air fryer', price: 80 }, 85)).toBeNull();
    expect(priceDrop({ name: 'Air fryer', price: null }, 50)).toBeNull();
    expect(priceDrop({ name: 'Air fryer', price: 80 }, 60)).toEqual({
      title: '💷 Price drop: Air fryer £60.00',
      body: 'Was £80.00 (£20.00 less, 25% off)',
    });
  });
});
