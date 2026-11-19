/** Fetches a page's preview data (title, picture, site, price) for research answers.
 *  Safety: http(s) only, never a private/local network address (checked again on every
 *  redirect and for the image), size and time limits, and the picture is re-encoded
 *  into a small JPEG here so the renderer only ever gets a data: URL. */
import { isIP } from 'node:net';
import { fmtPrice, type LinkPreview } from '@shared/preview';

export type Fetcher = (
  url: string,
  init: { redirect: 'manual'; headers: Record<string, string>; signal: AbortSignal },
) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export interface PreviewDeps {
  fetch: Fetcher;
  /** Resolve a hostname to its IP addresses. */
  lookup(host: string): Promise<string[]>;
  /** Re-encode image bytes to a small JPEG data URL, or null if it isn't an image. */
  thumbnail(bytes: Buffer): string | null;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const MAX_HTML = 800 * 1024;
const MAX_IMAGE = 4 * 1024 * 1024;

/** Loopback, private, link-local, carrier-grade NAT and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a = 0, b = 0] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === '::1' || s === '::') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped) return isPrivateAddress(mapped[1] ?? '');
    return /^(fc|fd|fe8|fe9|fea|feb)/.test(s);
  }
  return true;
}

async function safeUrl(raw: string, lookup: PreviewDeps['lookup']): Promise<URL | null> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || /\.(local|internal|lan|home|localhost)$/i.test(host))
    return null;
  const ips = isIP(host) ? [host] : await lookup(host).catch(() => []);
  if (!ips.length || ips.some(isPrivateAddress)) return null;
  return u;
}

/** GET with manual redirects (each hop re-checked) and a byte limit. */
async function get(
  url: string,
  d: PreviewDeps,
  limit: number,
  signal: AbortSignal,
): Promise<{ url: URL; type: string; body: Buffer } | null> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const u = await safeUrl(current, d.lookup);
    if (!u) return null;
    const res = await d.fetch(u.toString(), {
      redirect: 'manual',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,image/*;q=0.9,*/*;q=0.5',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      signal,
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return null;
      current = new URL(loc, u).toString();
      continue;
    }
    if (res.status !== 200) return null;
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > limit) return null;
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > limit) return null;
    return { url: u, type: (res.headers.get('content-type') ?? '').toLowerCase(), body };
  }
  return null;
}

const decode = (s: string): string =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();

/** Title, picture, site name and price from a page's <head>. */
export function parseMeta(html: string): {
  title: string;
  image: string;
  site: string;
  price: string;
} {
  const head = html.slice(0, 300_000);
  const metas = new Map<string, string>();
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = /(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (key && content !== undefined && !metas.has(key)) metas.set(key, decode(content));
  }
  const title =
    metas.get('og:title') ??
    metas.get('twitter:title') ??
    decode(/<title[^>]*>([^<]*)<\/title>/i.exec(head)?.[1] ?? '');
  const image =
    metas.get('og:image:secure_url') ??
    metas.get('og:image') ??
    metas.get('twitter:image') ??
    metas.get('twitter:image:src') ??
    '';
  const amount =
    metas.get('product:price:amount') ?? metas.get('og:price:amount') ?? metas.get('price') ?? '';
  const currency =
    metas.get('product:price:currency') ??
    metas.get('og:price:currency') ??
    metas.get('pricecurrency') ??
    'GBP';
  return {
    title: title.slice(0, 200),
    image,
    site: metas.get('og:site_name') ?? '',
    price: amount ? fmtPrice(amount, currency) : '',
  };
}

export class LinkPreviews {
  private cache = new Map<string, LinkPreview | null>();
  constructor(private readonly d: PreviewDeps) {}

  async one(url: string): Promise<LinkPreview | null> {
    if (this.cache.has(url)) return this.cache.get(url) ?? null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    let out: LinkPreview | null = null;
    try {
      const page = await get(url, this.d, MAX_HTML, ctrl.signal);
      if (page && /html/.test(page.type)) {
        const meta = parseMeta(page.body.toString('utf8'));
        const site = meta.site || page.url.hostname.replace(/^www\./, '');
        out = {
          url,
          title: meta.title || site,
          site,
          ...(meta.price ? { price: meta.price } : {}),
        };
        if (meta.image) {
          const img = await get(
            new URL(meta.image, page.url).toString(),
            this.d,
            MAX_IMAGE,
            ctrl.signal,
          ).catch(() => null);
          const thumb = img && /^image\//.test(img.type) ? this.d.thumbnail(img.body) : null;
          if (thumb) out.image = thumb;
        }
      }
    } catch {
      out = null;
    } finally {
      clearTimeout(timer);
    }
    if (this.cache.size > 300) this.cache.clear();
    this.cache.set(url, out);
    return out;
  }

  /** Several at once (4 in parallel); failures are simply left out. */
  async many(urls: string[]): Promise<LinkPreview[]> {
    const list = [...new Set(urls)].slice(0, 8);
    const out: Array<LinkPreview | null> = new Array(list.length).fill(null);
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < list.length) {
        const i = next++;
        out[i] = await this.one(list[i] ?? '');
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    return out.filter((p): p is LinkPreview => p !== null);
  }
}
