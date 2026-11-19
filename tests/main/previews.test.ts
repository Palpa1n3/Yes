import { describe, expect, it, vi } from 'vitest';
import { fmtPrice, linksIn } from '@shared/preview';
import {
  LinkPreviews,
  isPrivateAddress,
  parseMeta,
  type Fetcher,
} from '../../src/main/services/link-preview';

const PAGE = `<!doctype html><html><head>
<title>Fallback title</title>
<meta property="og:title" content="Logitech G305 Lightspeed Wireless Gaming Mouse &amp; Receiver">
<meta property="og:image" content="/images/g305.jpg">
<meta property="og:site_name" content="Example Shop">
<meta property="product:price:amount" content="29.99">
<meta property="product:price:currency" content="GBP">
</head><body>…</body></html>`;

describe('link previews', () => {
  it('reads title, picture, site and price', () => {
    expect(parseMeta(PAGE)).toEqual({
      title: 'Logitech G305 Lightspeed Wireless Gaming Mouse & Receiver',
      image: '/images/g305.jpg',
      site: 'Example Shop',
      price: '£29.99',
    });
    expect(parseMeta('<title>Just a title</title>')).toMatchObject({
      title: 'Just a title',
      image: '',
      price: '',
    });
    expect(fmtPrice('1,299', 'USD')).toBe('$1299');
    expect(fmtPrice('abc', 'GBP')).toBe('');
  });

  it('collects links from the answer and its sources', () => {
    expect(
      linksIn('Buy the [G305](https://shop.example/g305). See [review](https://rev.example/a).', [
        { url: 'https://rev.example/a' },
        { url: 'https://other.example/b' },
      ]),
    ).toEqual(['https://shop.example/g305', 'https://rev.example/a', 'https://other.example/b']);
    expect(linksIn('[x](javascript:alert(1)) [y](file:///C:/secret)')).toEqual([]);
  });

  it('never touches private or local addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '192.168.1.1',
      '172.20.0.5',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:192.168.0.1',
    ])
      expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ['8.8.8.8', '151.101.1.69', '2606:4700::1111'])
      expect(isPrivateAddress(ip)).toBe(false);
  });

  function setup(
    routes: Record<
      string,
      { status?: number; type?: string; body?: string | Buffer; location?: string }
    >,
    dns: Record<string, string> = {},
  ) {
    const fetch = vi.fn(async (url: string) => {
      const r = routes[url];
      if (!r)
        return {
          status: 404,
          headers: { get: () => null },
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      const body = typeof r.body === 'string' ? Buffer.from(r.body) : (r.body ?? Buffer.alloc(0));
      return {
        status: r.status ?? 200,
        headers: {
          get: (n: string) =>
            n === 'content-type'
              ? (r.type ?? 'text/html')
              : n === 'location'
                ? (r.location ?? null)
                : null,
        },
        arrayBuffer: async () =>
          body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
      };
    });
    const thumbnail = vi.fn((b: Buffer) => (b.length ? 'data:image/jpeg;base64,AAA' : null));
    const lp = new LinkPreviews({
      fetch: fetch as unknown as Fetcher,
      lookup: async (h) => [dns[h] ?? '93.184.216.34'],
      thumbnail,
    });
    return { lp, fetch, thumbnail };
  }

  it('builds a card with a shrunk picture, and caches it', async () => {
    const { lp, fetch } = setup({
      'https://shop.example/g305': { body: PAGE },
      'https://shop.example/images/g305.jpg': { type: 'image/jpeg', body: Buffer.from([1, 2, 3]) },
    });
    const card = await lp.one('https://shop.example/g305');
    expect(card).toEqual({
      url: 'https://shop.example/g305',
      title: 'Logitech G305 Lightspeed Wireless Gaming Mouse & Receiver',
      site: 'Example Shop',
      price: '£29.99',
      image: 'data:image/jpeg;base64,AAA',
    });
    await lp.one('https://shop.example/g305');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('refuses redirects and pictures that point at the local network', async () => {
    const { lp, fetch } = setup(
      {
        'https://evil.example/a': { status: 302, location: 'http://192.168.1.1/admin' },
        'https://ok.example/p': {
          body: '<meta property="og:title" content="Fine"><meta property="og:image" content="http://router.example/x.png">',
        },
      },
      { 'router.example': '192.168.1.254' },
    );
    expect(await lp.one('https://evil.example/a')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1); // the private hop was never requested
    expect(await lp.one('https://ok.example/p')).toEqual({
      url: 'https://ok.example/p',
      title: 'Fine',
      site: 'ok.example',
    });
    expect(await lp.one('http://localhost:3000/')).toBeNull();
    expect(await lp.one('file:///C:/Windows/win.ini')).toBeNull();
  });

  it('fetches several, leaving failures out', async () => {
    const { lp } = setup({ 'https://a.example/': { body: '<title>A</title>' } });
    const cards = await lp.many(['https://a.example/', 'https://missing.example/']);
    expect(cards.map((c) => c.title)).toEqual(['A']);
  });
});
