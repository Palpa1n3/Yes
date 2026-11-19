/** Picture cards for the pages and products a research answer links to. */
export interface LinkPreview {
  url: string;
  title: string;
  site: string;
  /** Small JPEG as a data: URL (downloaded and shrunk by ARC itself). */
  image?: string;
  price?: string;
}

/** http(s) links in a Markdown answer plus its sources, in order, without repeats. */
export function linksIn(text: string, sources: Array<{ url: string }> = [], max = 8): string[] {
  const out: string[] = [];
  const add = (u: string): void => {
    const clean = u.replace(/[).,;'"\]]+$/, '');
    if (!/^https?:\/\//i.test(clean)) return;
    try {
      const key = new URL(clean).toString();
      if (!out.includes(key)) out.push(key);
    } catch {
      /* not a URL */
    }
  };
  for (const m of text.matchAll(/\]\((https?:\/\/[^\s)]+)\)/g)) add(m[1] ?? '');
  for (const s of sources) add(s.url);
  return out.slice(0, max);
}

/** Prices like "29.99" + "GBP" → "£29.99". */
export function fmtPrice(amount: string, currency: string): string {
  const n = Number(amount.replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return '';
  const sym: Record<string, string> = {
    GBP: '£',
    USD: '$',
    EUR: '€',
    JPY: '¥',
    AUD: 'A$',
    CAD: 'C$',
  };
  const c = currency.toUpperCase();
  return sym[c] ? `${sym[c]}${n.toFixed(n % 1 ? 2 : 0)}` : `${n.toFixed(2)} ${c}`.trim();
}
