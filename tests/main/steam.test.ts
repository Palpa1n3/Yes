import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  parseManifest,
  progressText,
  steamUpdates,
  SteamWatch,
  type SteamApp,
} from '../../src/main/services/steam-watch';

const acf = (id: string, name: string, flags: number, to = 0, done = 0): string =>
  `"AppState"\n{\n\t"appid"\t\t"${id}"\n\t"name"\t\t"${name}"\n\t"StateFlags"\t\t"${flags}"\n\t"installdir"\t\t"${name}"\n\t"BytesToDownload"\t\t"${to}"\n\t"BytesDownloaded"\t\t"${done}"\n}\n`;

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('Steam updates', () => {
  it('reads the state of a game from its manifest', () => {
    expect(parseManifest(acf('1', 'Done', 4))).toMatchObject({ active: false, pending: false });
    expect(parseManifest(acf('2', 'Queued', 6))).toMatchObject({ active: false, pending: true });
    expect(parseManifest(acf('3', 'Going', 1030, 2 * 1024 ** 3, 1024 ** 3))).toMatchObject({
      active: true,
      pending: true,
    });
    expect(parseManifest(acf('4', 'Paused', 1542))).toMatchObject({ active: false, pending: true });
    const a = parseManifest(acf('3', 'Going', 1030, 2 * 1024 ** 3, 1024 ** 3)) as SteamApp;
    expect(progressText(a)).toBe('50% of 2.0 GB');
  });

  it('finds pending updates across libraries', () => {
    const root = mkdtempSync(join(tmpdir(), 'arc-steam-'));
    dirs.push(root);
    const main = join(root, 'Steam');
    const lib2 = join(root, 'Games');
    mkdirSync(join(main, 'steamapps'), { recursive: true });
    mkdirSync(join(lib2, 'steamapps', 'downloading', '30'), { recursive: true });
    writeFileSync(
      join(main, 'steamapps', 'libraryfolders.vdf'),
      `"libraryfolders"\n{\n"1"\n{\n"path"\t\t"${lib2.replace(/\\/g, '\\\\')}"\n}\n}`,
    );
    writeFileSync(join(main, 'steamapps', 'appmanifest_10.acf'), acf('10', 'Installed', 4));
    writeFileSync(join(main, 'steamapps', 'appmanifest_20.acf'), acf('20', 'Waiting', 6));
    writeFileSync(
      join(lib2, 'steamapps', 'appmanifest_30.acf'),
      acf('30', 'Big Game', 1030, 100, 10),
    );
    const ups = steamUpdates(main);
    expect(ups.map((a) => [a.name, a.active]).sort()).toEqual([
      ['Big Game', true],
      ['Waiting', false],
    ]);
  });

  it('waits for the games downloading when armed, then acts after two clear checks', async () => {
    const going = parseManifest(acf('3', 'Big Game', 1030, 100, 10)) as SteamApp;
    const queued = parseManifest(acf('2', 'Other', 6)) as SteamApp;
    let state: SteamApp[] = [going, queued];
    const done = vi.fn();
    const w = new SteamWatch({ read: async () => state, done });
    expect(await w.arm('shutdown')).toEqual({ ok: true, games: ['Big Game'] });
    await w.check();
    expect(done).not.toHaveBeenCalled();
    state = [queued]; // finished; the queued one isn't watched
    await w.check();
    expect(done).not.toHaveBeenCalled();
    await w.check();
    expect(done).toHaveBeenCalledWith(['Big Game'], 'shutdown');
    expect(w.status()).toBeNull();
  });

  it('explains when there is nothing to wait for, and honours a named game', async () => {
    const queued = parseManifest(acf('2', 'Other Game', 6)) as SteamApp;
    const w = new SteamWatch({ read: async () => [queued], done: vi.fn() });
    const r = await w.arm('shutdown');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain('Waiting (not started): Other Game');
    expect(await w.arm('notify', 'other')).toEqual({ ok: true, games: ['Other Game'] });
    expect(w.cancel()).toBe(true);
    const none = new SteamWatch({ read: async () => null, done: vi.fn() });
    expect(await none.arm('shutdown')).toEqual({
      ok: false,
      reason: 'Steam isn’t installed on this PC.',
    });
  });
});
