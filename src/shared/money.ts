/** Money helpers for the phone app: payslip vs rota, a real take-home rate from past payslips,
 *  subscriptions and repeat payments, spending by category, and price watching. Pure; tested in
 *  tests/money.test.ts. Nothing here talks to a bank. */
import { periodPay, type Shift } from './shifts';
import type { Payment } from './spending';

/* ── Payslips ── */
export interface Payslip {
  /** "2026-10-26" … "2026-11-22" (inclusive), as printed. */
  periodStart: string;
  periodEnd: string;
  payDate: string;
  hours: number | null;
  rate: number | null;
  gross: number | null;
  tax: number | null;
  ni: number | null;
  pension: number | null;
  net: number | null;
  /** Holiday built up / left, in hours (if the payslip says). */
  holidayHours: number | null;
}

const num = (v: unknown, max = 1e6): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max
    ? Math.round(v * 100) / 100
    : null;
const day = (v: unknown): string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';

export function cleanPayslip(raw: unknown): Payslip | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const p: Payslip = {
    periodStart: day(o.periodStart),
    periodEnd: day(o.periodEnd),
    payDate: day(o.payDate),
    hours: num(o.hours, 400),
    rate: num(o.rate, 500),
    gross: num(o.gross),
    tax: num(o.tax),
    ni: num(o.ni),
    pension: num(o.pension),
    net: num(o.net),
    holidayHours: num(o.holidayHours, 1000),
  };
  return p.gross !== null || p.net !== null || p.hours !== null ? p : null;
}

const money = (n: number): string => `£${n.toFixed(2)}`;
const plusDay = (d: string): string => {
  const x = new Date(`${d}T12:00`);
  x.setDate(x.getDate() + 1);
  return x.toISOString().slice(0, 10);
};

export interface PayslipCheck {
  period: { start: string; end: string } | null;
  rotaHours: number | null;
  issues: string[];
  /** A polite line to send the manager, when something looks short. */
  ask: string | null;
}

/** Compare a payslip with the shifts saved for its period and the user's pay rate. */
export function comparePayslip(
  slip: Payslip,
  shifts: Shift[],
  o: { rate: number; unpaidBreak: number; breakOver: number },
): PayslipCheck {
  const issues: string[] = [];
  let ask: string | null = null;
  const period =
    slip.periodStart && slip.periodEnd
      ? { start: slip.periodStart, end: plusDay(slip.periodEnd) }
      : null;
  const rate = slip.rate ?? o.rate;
  let rotaHours: number | null = null;
  if (period) {
    const p = periodPay(shifts, period, rate, o.unpaidBreak, o.breakOver);
    rotaHours = p.shifts ? p.hours : null;
    if (rotaHours !== null && slip.hours !== null) {
      const diff = Math.round((rotaHours - slip.hours) * 100) / 100;
      if (Math.abs(diff) >= 0.25) {
        const pay = Math.abs(diff) * rate;
        issues.push(
          diff > 0
            ? `Payslip has ${slip.hours}h, your rota shows ${rotaHours}h: ${diff}h ≈ ${money(pay)} missing.`
            : `Payslip has ${slip.hours}h, your rota shows ${rotaHours}h: you were paid ${-diff}h more than your saved shifts (a shift missing from your rota?).`,
        );
        if (diff > 0)
          ask = `Hi, could you check my hours for ${slip.periodStart} to ${slip.periodEnd}? My rota shows ${rotaHours} hours but my payslip has ${slip.hours} (${diff}h, about ${money(pay)}). Thanks.`;
      }
    }
  }
  if (slip.rate !== null && o.rate > 0 && Math.abs(slip.rate - o.rate) >= 0.01)
    issues.push(
      `Payslip rate is ${money(slip.rate)}/h; you have ${money(o.rate)}/h saved in Alton.`,
    );
  if (slip.hours !== null && slip.rate !== null && slip.gross !== null) {
    const expect = slip.hours * slip.rate;
    if (Math.abs(expect - slip.gross) >= 1)
      issues.push(
        `Gross pay is ${money(slip.gross)}, but ${slip.hours}h × ${money(slip.rate)} is ${money(expect)} (overtime, holiday pay or a bonus would explain it).`,
      );
  }
  if (slip.gross !== null && slip.net !== null) {
    const ded = (slip.tax ?? 0) + (slip.ni ?? 0) + (slip.pension ?? 0);
    if (ded > 0 && Math.abs(slip.gross - ded - slip.net) >= 1)
      issues.push(
        `Gross minus tax, NI and pension is ${money(slip.gross - ded)}, but net pay is ${money(slip.net)}: there's another deduction or payment on it.`,
      );
  }
  return { period, rotaHours, issues, ask };
}

/** What share of gross pay actually reaches the bank, from recent payslips (else null). */
export function takeHomeRate(history: Payslip[]): number | null {
  const r = history
    .filter((p) => (p.gross ?? 0) > 0 && (p.net ?? 0) > 0)
    .slice(-3)
    .map((p) => (p.net as number) / (p.gross as number))
    .filter((x) => x > 0.4 && x <= 1);
  if (!r.length) return null;
  return Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 1000) / 1000;
}

/* ── Spending: repeat payments, subscriptions, categories ── */
const CATEGORIES: Array<[string, RegExp]> = [
  ['Music', /spotify|apple music|youtube music|amazon music|deezer|tidal|soundcloud/i],
  [
    'TV and video',
    /netflix|disney|prime video|now tv|nowtv|paramount|apple tv|britbox|crunchyroll|dazn/i,
  ],
  ['Gaming', /xbox|playstation|psn|steam|nintendo|epic games|game pass/i],
  ['Phone and internet', /\b(o2|ee|vodafone|three|giffgaff|bt|sky|virgin|plusnet|talktalk)\b/i],
  ['Groceries', /tesco|sainsbury|asda|morrisons|aldi|lidl|co-?op|iceland|waitrose|m&s food|spar/i],
  [
    'Eating out',
    /mcdonald|kfc|greggs|costa|starbucks|subway|domino|just eat|deliveroo|uber eats|nando|pizza|burger/i,
  ],
  [
    'Transport',
    /shell|bp|esso|texaco|uber|bolt|trainline|gwr|tfw|arriva|stagecoach|parking|petrol/i,
  ],
  ['Shopping', /amazon|ebay|vinted|argos|currys|primark|asos|shein|temu|next\b|jd sports/i],
  ['Bills', /council|water|energy|octopus|british gas|edf|eon|insurance|tv licen/i],
  ['Fitness', /gym|puregym|the gym|fitness/i],
];
export const categoryOf = (merchant: string): string =>
  CATEGORIES.find(([, re]) => re.test(merchant))?.[0] ?? 'Other';

export interface Recurring {
  merchant: string;
  amount: number;
  every: 'week' | 'month';
  last: number;
  /** The amount went up (from → to). */
  rise: { from: number; to: number } | null;
}

/** Payments to the same place roughly every week or month, for about the same amount. */
export function findRecurring(payments: Payment[]): Recurring[] {
  const by = new Map<string, Payment[]>();
  for (const p of payments) {
    if (p.kind !== 'spend' || !p.merchant) continue;
    const k = p.merchant.toLowerCase();
    by.set(k, [...(by.get(k) ?? []), p]);
  }
  const out: Recurring[] = [];
  for (const list of by.values()) {
    if (list.length < 2) continue;
    const s = [...list].sort((a, b) => a.at - b.at);
    const gaps = s.slice(1).map((p, i) => (p.at - (s[i] as Payment).at) / 86_400_000);
    const monthly = gaps.every((g) => g >= 25 && g <= 35);
    const weekly = gaps.every((g) => g >= 5.5 && g <= 8.5);
    if (!monthly && !weekly) continue;
    const amounts = s.map((p) => p.amount);
    const first = amounts[0] as number;
    if (amounts.some((a) => Math.abs(a - first) / first > 0.3)) continue;
    const lastP = s[s.length - 1] as Payment;
    const prev = amounts[amounts.length - 2] as number;
    out.push({
      merchant: lastP.merchant,
      amount: lastP.amount,
      every: monthly ? 'month' : 'week',
      last: lastP.at,
      rise: lastP.amount > prev * 1.02 ? { from: prev, to: lastP.amount } : null,
    });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

export interface SpendingCheck {
  recurring: Recurring[];
  categories: Array<{ name: string; total: number }>;
  suggestions: string[];
}

/** Subscriptions, price rises, the biggest categories since `from`, and plain suggestions. */
export function spendingCheck(payments: Payment[], from: number): SpendingCheck {
  const recurring = findRecurring(payments);
  const totals = new Map<string, number>();
  for (const p of payments)
    if (p.kind === 'spend' && p.at >= from) {
      const c = categoryOf(p.merchant);
      totals.set(c, (totals.get(c) ?? 0) + p.amount);
    }
  const categories = [...totals.entries()]
    .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);
  const suggestions: string[] = [];
  const byCat = new Map<string, string[]>();
  for (const r of recurring) {
    const c = categoryOf(r.merchant);
    byCat.set(c, [...(byCat.get(c) ?? []), r.merchant]);
  }
  for (const [c, names] of byCat)
    if (names.length >= 2 && c !== 'Other' && c !== 'Groceries' && c !== 'Bills')
      suggestions.push(
        `You pay for ${names.length} ${c === 'Music' ? 'music apps' : c === 'TV and video' ? 'TV and video services' : `${c.toLowerCase()} subscriptions`} (${names.join(', ')}): do you need them all?`,
      );
  for (const r of recurring)
    if (r.rise)
      suggestions.push(
        `${r.merchant} went up from £${r.rise.from.toFixed(2)} to £${r.rise.to.toFixed(2)}.`,
      );
  const monthly = recurring.filter((r) => r.every === 'month').reduce((n, r) => n + r.amount, 0);
  if (monthly > 0)
    suggestions.push(`Repeat monthly payments add up to about £${monthly.toFixed(2)} a month.`);
  return { recurring, categories, suggestions };
}

/* ── Price watching ── */
/** The price on a product page: structured data (JSON-LD offers, product meta tags, itemprop). */
export function extractPrice(html: string): number | null {
  const tries: RegExp[] = [
    /"@type"\s*:\s*"(?:Offer|AggregateOffer)"[^}]*?"(?:price|lowPrice)"\s*:\s*"?(\d+(?:\.\d{1,2})?)/i,
    /"(?:price|lowPrice)"\s*:\s*"?(\d+(?:\.\d{1,2})?)"?\s*,\s*"priceCurrency"\s*:\s*"GBP"/i,
    /"priceCurrency"\s*:\s*"GBP"\s*,\s*"(?:price|lowPrice)"\s*:\s*"?(\d+(?:\.\d{1,2})?)/i,
    /<meta[^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["'][^>]+content=["'](\d+(?:\.\d{1,2})?)/i,
    /<meta[^>]+content=["'](\d+(?:\.\d{1,2})?)["'][^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)/i,
    /itemprop=["']price["'][^>]*content=["'](\d+(?:\.\d{1,2})?)/i,
  ];
  for (const re of tries) {
    const m = re.exec(html);
    const v = m?.[1] ? Number(m[1]) : NaN;
    if (Number.isFinite(v) && v > 0 && v < 100_000) return v;
  }
  return null;
}

export interface PriceWatch {
  id: string;
  name: string;
  url: string;
  /** The price when last checked, the lowest seen, and when it was checked. */
  price: number | null;
  lowest: number | null;
  checked: number;
  added: number;
}

/** A real drop worth telling the user about (at least 2 % and 50p below the last price). */
export function priceDrop(
  w: Pick<PriceWatch, 'price' | 'name'>,
  now: number,
): { title: string; body: string } | null {
  if (w.price === null || now >= w.price) return null;
  const by = w.price - now;
  if (by < 0.5 || by / w.price < 0.02) return null;
  return {
    title: `💷 Price drop: ${w.name.slice(0, 40)} £${now.toFixed(2)}`,
    body: `Was £${w.price.toFixed(2)} (£${by.toFixed(2)} less, ${Math.round((by / w.price) * 100)}% off)`,
  };
}
