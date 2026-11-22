/** Spending from bank-app notifications ("You spent £4.20 at Tesco"). The phone keeps the
 *  notifications of the bank apps the user picks (on the phone only, never sent anywhere);
 *  these pure helpers turn them into payments and a "since payday" summary. */

export interface BankNote {
  app: string;
  title: string;
  text: string;
  at: number;
}

export interface Payment {
  /** Pounds, always positive. */
  amount: number;
  /** Who it went to / came from ('' when the notification doesn't say). */
  merchant: string;
  kind: 'spend' | 'in' | 'refund';
  at: number;
  app: string;
}

const AMOUNT = /(?:£|GBP\s?)\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/i;
const BALANCE = /\b(balance|available|overdraft|limit|statement|minimum payment|due)\b/i;
const IN = /\b(received|paid in|credited|deposit|incoming|sent you|you got|salary|wages)\b/i;
const REFUND = /\b(refund(ed)?|reversed|returned)\b/i;
const DECLINED = /\b(declined|failed|unsuccessful|cancelled|canceled|blocked)\b/i;

const tidy = (s: string): string =>
  s
    .replace(/\s+/g, ' ')
    .replace(/[.,!:;\s]+$/, '')
    .replace(/^the\s+/i, '')
    .trim()
    .slice(0, 40);

function merchantOf(text: string, title: string): string {
  const m =
    /\b(?:at|to|from)\s+([A-Z0-9][\w&'’.*\- ]{1,40}?)(?=\s+(?:on|for|using|with|via|was|has|is|card|ending)\b|[.,!]|$)/.exec(
      text,
    ) ?? /^([A-Z0-9][\w&'’.*\- ]{1,40}?)\s*[-–:]\s*£/.exec(text);
  if (m?.[1]) return tidy(m[1]);
  // Monzo-style: the title is the shop, the text is the amount.
  if (
    title &&
    !AMOUNT.test(title) &&
    !/\b(payment|spent|bank|card|alert|transaction)\b/i.test(title)
  )
    return tidy(title);
  return '';
}

/** One payment from a bank notification, or null (balances, declines, not money). */
export function parsePayment(n: BankNote): Payment | null {
  const all = `${n.title} ${n.text}`;
  const a = AMOUNT.exec(all);
  if (!a?.[1]) return null;
  if (DECLINED.test(all)) return null;
  const amount = Number(a[1].replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000) return null;
  const kind: Payment['kind'] = REFUND.test(all) ? 'refund' : IN.test(all) ? 'in' : 'spend';
  // "Your balance is £240" is not a payment; "You spent £4, balance £240" is.
  if (kind === 'spend' && BALANCE.test(all) && !/\b(spent|paid|purchase|payment)\b/i.test(all))
    return null;
  return { amount, merchant: merchantOf(n.text, n.title), kind, at: n.at, app: n.app };
}

/** Payments from notifications, with the same payment shown twice (e.g. Google Pay and the
 *  bank both notify) counted once: same amount within 3 minutes. Oldest first. */
export function paymentsFrom(notes: BankNote[]): Payment[] {
  const list = notes
    .map(parsePayment)
    .filter((p): p is Payment => !!p)
    .sort((a, b) => a.at - b.at);
  const out: Payment[] = [];
  for (const p of list) {
    const dup = out.find(
      (q) => q.kind === p.kind && q.amount === p.amount && Math.abs(q.at - p.at) < 3 * 60_000,
    );
    if (dup) {
      if (!dup.merchant && p.merchant) dup.merchant = p.merchant;
      continue;
    }
    out.push({ ...p });
  }
  return out;
}

export interface SpendSummary {
  spent: number;
  refunds: number;
  income: number;
  count: number;
  /** Biggest places by total spent. */
  top: Array<{ merchant: string; total: number; count: number }>;
  /** Average spent per day so far in the period. */
  perDay: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Totals for payments from `from` (inclusive) to `to` (exclusive, default now). */
export function spendSummary(payments: Payment[], from: number, to = Date.now()): SpendSummary {
  const inside = payments.filter((p) => p.at >= from && p.at < to);
  const spends = inside.filter((p) => p.kind === 'spend');
  const by = new Map<string, { merchant: string; total: number; count: number }>();
  for (const p of spends) {
    const k = (p.merchant || 'Other').toLowerCase();
    const e = by.get(k) ?? { merchant: p.merchant || 'Other', total: 0, count: 0 };
    e.total += p.amount;
    e.count++;
    by.set(k, e);
  }
  const spent = spends.reduce((n, p) => n + p.amount, 0);
  const refunds = inside.filter((p) => p.kind === 'refund').reduce((n, p) => n + p.amount, 0);
  const days = Math.max(1, Math.ceil((Math.min(to, Date.now()) - from) / 86_400_000));
  return {
    spent: round2(spent),
    refunds: round2(refunds),
    income: round2(inside.filter((p) => p.kind === 'in').reduce((n, p) => n + p.amount, 0)),
    count: spends.length,
    top: [...by.values()]
      .map((e) => ({ ...e, total: round2(e.total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5),
    perDay: round2((spent - refunds) / days),
  };
}

/** "£12.50" */
export const gbp = (n: number): string =>
  `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
