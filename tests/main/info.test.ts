import { mkdirSync, mkdtempSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { latencyChecks, networkDetails } from '../../src/main/services/network-info';
import { folderSize, recentDownloads } from '../../src/main/services/storage-info';

function tree() {
  const root = mkdtempSync(join(tmpdir(), 'arc-st-'));
  mkdirSync(join(root, 'sub', 'deep'), { recursive: true });
  writeFileSync(join(root, 'a.bin'), Buffer.alloc(1000));
  writeFileSync(join(root, 'sub', 'b.bin'), Buffer.alloc(2000));
  writeFileSync(join(root, 'sub', 'deep', 'c.bin'), Buffer.alloc(3000));
  const old = new Date(Date.now() - 200 * 86_400_000);
  utimesSync(join(root, 'sub', 'b.bin'), old, old);
  try {
    symlinkSync(root, join(root, 'loop')); // must not be followed
  } catch {
    /* symlinks may be unavailable on Windows CI */
  }
  writeFileSync(join(root, 'movie.mp4.crdownload'), 'x');
  return root;
}

describe('storage-info', () => {
  it('sums sizes recursively, skips symlinks, and counts old files', async () => {
    const root = tree();
    const r = await folderSize(root, { budgetMs: 5000, olderThan: Date.now() - 90 * 86_400_000 });
    expect(r).toMatchObject({ bytes: 6001, files: 4, complete: true, oldBytes: 2000 });
  });

  it('reports a partial result when the time budget runs out', async () => {
    const r = await folderSize(tree(), { budgetMs: -1 });
    expect(r.complete).toBe(false);
  });

  it('lists recent downloads newest first, hiding partial downloads', async () => {
    const root = tree();
    const items = await recentDownloads(root);
    expect(items.map((i) => i.name)).toEqual(['a.bin']);
    expect(await recentDownloads(join(root, 'missing'))).toEqual([]);
  });
});

describe('network-info', () => {
  const si = {
    networkInterfaces: async () => [
      {
        iface: 'lo',
        ifaceName: 'lo',
        internal: true,
        default: false,
        type: 'virtual',
        operstate: 'up',
        ip4: '127.0.0.1',
        mac: '',
        speed: null,
        virtual: false,
      },
      {
        iface: 'Wi-Fi',
        ifaceName: 'Wi-Fi',
        internal: false,
        default: true,
        type: 'wireless',
        operstate: 'up',
        ip4: '192.168.1.24',
        mac: 'aa',
        speed: 866,
        virtual: false,
      },
      {
        iface: 'vEthernet (WSL)',
        ifaceName: 'vEthernet (WSL)',
        internal: false,
        default: false,
        type: 'wired',
        operstate: 'up',
        ip4: '172.24.80.1',
        mac: 'bb',
        speed: 10000,
        virtual: false,
      },
    ],
    networkGatewayDefault: async () => '192.168.1.1',
    wifiConnections: async () => [{ ssid: 'HomeNet', quality: 72 }],
    inetLatency: async (host: string) => (host === '8.8.8.8' ? null : 12),
  } as never;

  it('maps adapters, flags virtual ones, and reads Wi-Fi', async () => {
    const d = await networkDetails(si);
    expect(d.gateway).toBe('192.168.1.1');
    expect(d.interfaces.map((i) => [i.name, i.type, i.isDefault])).toEqual([
      ['Wi-Fi', 'wireless', true],
      ['vEthernet (WSL)', 'virtual', false],
    ]);
    expect(d.wifi).toEqual({ ssid: 'HomeNet', signal: 72 });
  });

  it('pings the router first and reports no reply as null', async () => {
    const r = await latencyChecks(si, '192.168.1.1');
    expect(r[0]).toEqual({ name: 'Router', host: '192.168.1.1', ms: 12 });
    expect(r.find((x) => x.host === '8.8.8.8')?.ms).toBeNull();
  });
});
