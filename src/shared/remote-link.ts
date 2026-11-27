/** How a phone reaches Alton's phone server, and whether that link is encrypted. Pure; tested in
 *  tests/remote-link.test.ts.
 *  - loopback: through Tailscale's HTTPS (tailscale serve forwards https://<pc>.ts.net to this
 *    PC), or this PC itself: encrypted.
 *  - tailscale: straight to the PC's 100.x Tailscale address: encrypted by Tailscale's tunnel.
 *  - lan: plain HTTP over the home Wi-Fi (192.168.x…): not encrypted.
 *  - outside: anything else: always refused. */
export type LinkKind = 'loopback' | 'tailscale' | 'lan' | 'outside';

export function linkKind(addr: string | undefined): LinkKind {
  if (!addr) return 'outside';
  const a = addr.replace(/^::ffff:/, '');
  if (/^127\./.test(a) || a === '::1') return 'loopback';
  const t = /^100\.(\d+)\./.exec(a);
  if (t && Number(t[1]) >= 64 && Number(t[1]) <= 127) return 'tailscale';
  if (/^fd7a:115c:a1e0:/i.test(a)) return 'tailscale';
  if (/^(10\.|192\.168\.|169\.254\.)/.test(a)) return 'lan';
  const m = /^172\.(\d+)\./.exec(a);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return 'lan';
  if (/^f[cd][0-9a-f]{2}:/i.test(a) || /^fe80:/i.test(a)) return 'lan';
  return 'outside';
}

/** Is this link encrypted? */
export const encryptedLink = (k: LinkKind): boolean => k === 'loopback' || k === 'tailscale';

/** `tailscale serve status` output: the https://…ts.net address that forwards to `port` here. */
export function serveUrlFor(statusText: string, port: number): string | null {
  const lines = statusText.split(/\r?\n/);
  let current: string | null = null;
  for (const line of lines) {
    const head = /^(https:\/\/[\w.-]+\.ts\.net)(?::\d+)?\b/.exec(line.trim());
    if (head?.[1]) {
      current = head[1];
      continue;
    }
    const proxy = /proxy\s+https?:\/\/(?:127\.0\.0\.1|localhost):(\d+)/.exec(line);
    if (current && proxy && Number(proxy[1]) === port) return current;
  }
  return null;
}
