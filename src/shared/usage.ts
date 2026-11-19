/** Claude spending: what each request cost, from the token counts Anthropic returns.
 *  Prices are US dollars per million tokens (Anthropic's published rates for these models).
 *  Estimates only: your Anthropic console shows the exact bill. */

export interface Usage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: {
    web_search_requests?: number | null;
    web_fetch_requests?: number | null;
  } | null;
}

interface Price {
  input: number;
  output: number;
  cacheRead: number;
}

/** $/MTok. Haiku 5.5 costs more when one prompt is over 100K tokens. */
export function priceFor(model: string, promptTokens = 0): Price {
  if (model.includes('opus')) return { input: 4, output: 20, cacheRead: 0.2 };
  if (model.includes('sonnet')) return { input: 2, output: 10, cacheRead: 0.1 };
  // Haiku 5.5 (default)
  return promptTokens > 100_000
    ? { input: 0.5, output: 2.5, cacheRead: 0.05 }
    : { input: 0.1, output: 0.5, cacheRead: 0.01 };
}

/** Web searches are billed per search: $10 per 1,000. */
export const WEB_SEARCH_USD = 0.01;

/** Estimated cost of one request in US dollars. Cache writes are charged at 1.25× input. */
export function costOf(model: string, u: Usage): number {
  const input = u.input_tokens ?? 0;
  const read = u.cache_read_input_tokens ?? 0;
  const write = u.cache_creation_input_tokens ?? 0;
  const p = priceFor(model, input + read + write);
  const tokens =
    (input * p.input +
      write * p.input * 1.25 +
      read * p.cacheRead +
      (u.output_tokens ?? 0) * p.output) /
    1_000_000;
  return tokens + (u.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_USD;
}

export interface DayUsage {
  /** YYYY-MM-DD (local). */
  day: string;
  usd: number;
  requests: number;
  /** Spend by feature (chat, research, agent, memory, phone…). */
  by: Record<string, number>;
}

export interface UsageSummary {
  today: number;
  month: number;
  /** Monthly limit in dollars (0 = none). */
  budget: number;
  days: DayUsage[];
  byFeature: Record<string, number>;
}

export const dayKey = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Add one request to the daily totals (keeps 92 days). */
export function addUsage(
  days: DayUsage[],
  usd: number,
  feature: string,
  now = new Date(),
): DayUsage[] {
  const key = dayKey(now);
  const out = days.filter((d) => d.day !== key);
  const today = days.find((d) => d.day === key) ?? { day: key, usd: 0, requests: 0, by: {} };
  out.push({
    ...today,
    usd: today.usd + usd,
    requests: today.requests + 1,
    by: { ...today.by, [feature]: (today.by[feature] ?? 0) + usd },
  });
  return out.sort((a, b) => a.day.localeCompare(b.day)).slice(-92);
}

export function summarise(days: DayUsage[], budget: number, now = new Date()): UsageSummary {
  const month = dayKey(now).slice(0, 7);
  const thisMonth = days.filter((d) => d.day.startsWith(month));
  const byFeature: Record<string, number> = {};
  for (const d of thisMonth)
    for (const [k, v] of Object.entries(d.by)) byFeature[k] = (byFeature[k] ?? 0) + v;
  return {
    today: days.find((d) => d.day === dayKey(now))?.usd ?? 0,
    month: thisMonth.reduce((n, d) => n + d.usd, 0),
    budget,
    days: days.slice(-31),
    byFeature,
  };
}

/** "$0.42", "under 1¢". */
export function fmtUsd(n: number): string {
  if (n > 0 && n < 0.01) return 'under 1¢';
  return `$${n.toFixed(n < 10 ? 2 : 0)}`;
}

/** Which budget warning (if any) a new month total crosses: 80% and 100%. */
export function budgetCrossed(before: number, after: number, budget: number): 80 | 100 | null {
  if (budget <= 0) return null;
  if (before < budget && after >= budget) return 100;
  if (before < budget * 0.8 && after >= budget * 0.8) return 80;
  return null;
}

/** For the spending bar: how full this month's limit is, and the colour to show. */
export function spendLevel(
  month: number,
  budget: number,
): { pct: number; tone: 'ok' | 'warn' | 'over' } {
  if (!(budget > 0)) return { pct: 0, tone: 'ok' };
  const pct = Math.min(100, (month / budget) * 100);
  return { pct, tone: month >= budget ? 'over' : pct >= 80 ? 'warn' : 'ok' };
}

/** Where this month is heading at the current rate (spent so far ÷ days gone × days in month). */
export function projectMonth(month: number, now = new Date()): number {
  const day = now.getDate();
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return day > 0 ? (month / day) * days : month;
}
