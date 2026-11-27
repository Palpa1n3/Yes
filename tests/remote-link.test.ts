import { describe, expect, it } from 'vitest';
import { encryptedLink, linkKind, serveUrlFor } from '@shared/remote-link';

describe('how a phone reaches Alton', () => {
  it('tells encrypted links from plain home Wi-Fi', () => {
    expect(linkKind('127.0.0.1')).toBe('loopback');
    expect(linkKind('::ffff:127.0.0.1')).toBe('loopback');
    expect(linkKind('100.101.2.3')).toBe('tailscale');
    expect(linkKind('192.168.1.20')).toBe('lan');
    expect(linkKind('10.0.0.5')).toBe('lan');
    expect(linkKind('172.20.1.1')).toBe('lan');
    expect(linkKind('8.8.8.8')).toBe('outside');
    expect(linkKind('100.200.1.1')).toBe('outside');
    expect(encryptedLink('loopback')).toBe(true);
    expect(encryptedLink('tailscale')).toBe(true);
    expect(encryptedLink('lan')).toBe(false);
  });

  it('finds the Tailscale HTTPS address that forwards to Alton', () => {
    const status =
      'https://palpatine.tailf883ad.ts.net (tailnet only)\n|-- / proxy http://127.0.0.1:47615\n';
    expect(serveUrlFor(status, 47615)).toBe('https://palpatine.tailf883ad.ts.net');
    expect(serveUrlFor(status, 8080)).toBeNull();
    expect(serveUrlFor('No serve config', 47615)).toBeNull();
  });
});
