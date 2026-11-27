/** Keeping Alton's memories tidy: near-duplicates are merged (the newest wording wins, since it's
 *  usually the most up to date), and memories tied to a moment ("tomorrow", "today", "this
 *  week") are retired once that moment has passed. Pure; tested in tests/memory-tidy.test.ts. */

export interface TidyMemory {
  id: string;
  text: string;
  createdAt: number;
  project?: string;
}

const STOP = new Set(
  'a an the and or of to in on at for with by from as is are was were be been their they them this that these those it its per has have had do does did not no yes but so if then than there here also about into over under up down out very just only which who whom whose what when where why how all any some each other such own same both more most can will would should could may might must user users conversation mentioned assistant according'.split(
    ' ',
  ),
);

/** The words that carry the meaning (lower case, no little words). */
export function keyWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[’']s\b/g, '')
      .split(/[^a-z0-9:.]+/)
      .map((w) => w.replace(/^[.:]+|[.:]+$/g, ''))
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
}

/** How alike two memories are, 0–1 (shared words over all words). */
export function similarity(a: string, b: string): number {
  const x = keyWords(a);
  const y = keyWords(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

/** Close enough to say the same thing (a new memory updates the old instead of repeating it). */
export const SAME_THING = 0.75;
/** Close enough to merge in a tidy-up. */
export const NEAR_DUPLICATE = 0.5;

const DAY = 86_400_000;

/** A memory about a moment that has passed (it said "tomorrow" three days ago, and so on). */
export function outOfDate(m: TidyMemory, now: number): boolean {
  const age = now - m.createdAt;
  const t = m.text.toLowerCase();
  // A one-off on a date that's over ("Thursday 26 Nov"): finished two days after it.
  const d =
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/.exec(
      t,
    );
  if (d?.[1] && d[2] && /\b(shift|appointment|meeting|booked|due|on|is at|starts)\b/.test(t)) {
    const month = 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(d[2]) / 3;
    const made = new Date(m.createdAt);
    let when = new Date(made.getFullYear(), month, Number(d[1])).getTime();
    // "3 Jan" written in late December means next year.
    if (when < m.createdAt - 60 * DAY)
      when = new Date(made.getFullYear() + 1, month, Number(d[1])).getTime();
    if (now > when + 2 * DAY) return true;
  }
  if (/\b(tomorrow|today|tonight|next day|this morning|this afternoon|this evening)\b/.test(t))
    return age > 3 * DAY;
  if (/\b(this week|next week|this weekend|in a few days)\b/.test(t)) return age > 14 * DAY;
  if (/\b(currently|right now|at the moment|this month)\b/.test(t)) return age > 60 * DAY;
  return false;
}

export interface TidyPlan {
  /** Groups saying the same thing: keep the newest, drop the rest. */
  merges: Array<{ keep: string; drop: string[] }>;
  /** Memories about a moment that has passed. */
  outOfDate: string[];
}

/** What a tidy-up would change (nothing is changed here). */
export function planTidy(memories: TidyMemory[], now: number): TidyPlan {
  const stale = new Set(memories.filter((m) => outOfDate(m, now)).map((m) => m.id));
  const live = memories.filter((m) => !stale.has(m.id));
  // Newest first, so each group keeps its newest member.
  const sorted = [...live].sort((a, b) => b.createdAt - a.createdAt);
  const used = new Set<string>();
  const merges: TidyPlan['merges'] = [];
  for (const m of sorted) {
    if (used.has(m.id)) continue;
    used.add(m.id);
    const drop = sorted
      .filter(
        (o) =>
          !used.has(o.id) &&
          (o.project ?? '') === (m.project ?? '') &&
          similarity(m.text, o.text) >= NEAR_DUPLICATE,
      )
      .map((o) => o.id);
    for (const d of drop) used.add(d);
    if (drop.length) merges.push({ keep: m.id, drop });
  }
  return { merges, outOfDate: [...stale] };
}

/** How many memories a plan removes. */
export const tidyCount = (p: TidyPlan): number =>
  p.outOfDate.length + p.merges.reduce((n, g) => n + g.drop.length, 0);
