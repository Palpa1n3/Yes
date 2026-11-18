import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Cleanup, cleanupTargets } from '../../src/main/services/cleanup';

const MB = 1024 ** 2;
function file(p: string, bytes: number, ageDays = 0): string {
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, Buffer.alloc(bytes));
  if (ageDays) {
    const t = (Date.now() - ageDays * 86_400_000) / 1000;
    utimesSync(p, t, t);
  }
  return p;
}

function machine() {
  const root = mkdtempSync(join(tmpdir(), 'arc-clean-'));
  const env = {
    temp: join(root, 'Temp'),
    downloads: join(root, 'Downloads'),
    localAppData: join(root, 'Local'),
    appData: join(root, 'Roaming'),
  };
  const L = env.localAppData;
  file(join(env.temp, 'old-installer.tmp'), 3 * MB, 5);
  file(join(env.temp, 'in-use-now.tmp'), 1 * MB); // too new: left alone
  file(join(L, 'CrashDumps', 'game.dmp'), 2 * MB);
  file(
    join(L, 'Google', 'Chrome', 'User Data', 'Default', 'Cache', 'Cache_Data', 'f_000001'),
    4 * MB,
  );
  file(join(L, 'Google', 'Chrome', 'User Data', 'Default', 'Login Data'), 1000); // never touched
  file(join(L, 'NVIDIA', 'DXCache', 'shader.bin'), 1 * MB);
  file(join(env.appData, 'discord', 'Cache', 'x'), 1 * MB);
  file(join(env.downloads, 'big-game-setup.exe'), 210 * MB);
  file(join(env.downloads, 'ancient.zip'), 20 * MB, 400);
  file(join(env.downloads, 'homework.docx'), 1 * MB, 400); // old but small: not suggested
  file(join(env.downloads, 'recent.pdf'), 5 * MB);
  return { root, env };
}

describe('cleanup', () => {
  it('knows the safe places, including every browser profile', () => {
    const { env } = machine();
    mkdirSync(join(env.localAppData, 'Google', 'Chrome', 'User Data', 'Profile 2'), {
      recursive: true,
    });
    const t = cleanupTargets(env);
    expect(t.browsers.filter((p) => p.includes('Chrome')).length).toBe(6); // 2 profiles × 3 caches
    expect(t.browsers.some((p) => p.includes('Login Data'))).toBe(false);
    expect(t.temp).toEqual([env.temp]);
  });

  it('sizes each category and finds big or old downloads', async () => {
    const { env } = machine();
    const c = new Cleanup({ env, recycleSize: async () => 7 * MB });
    const scan = await c.scan();
    const by = (id: string) => scan.items.find((i) => i.id === id);
    expect(by('temp')?.bytes).toBe(3 * MB); // only the old file
    expect(by('crash')?.bytes).toBe(2 * MB);
    expect(by('browsers')?.bytes).toBe(4 * MB);
    expect(by('shaders')?.bytes).toBe(1 * MB);
    expect(by('launchers')?.bytes).toBe(1 * MB);
    expect(by('recycle')?.bytes).toBe(7 * MB);
    expect(scan.downloads.map((f) => f.name)).toEqual(['big-game-setup.exe', 'ancient.zip']);
  });

  it('clears only what was chosen, keeps profiles and new temp files, trashes chosen downloads', async () => {
    const { env } = machine();
    const trash = vi.fn(async () => undefined);
    const empty = vi.fn(async () => true);
    const c = new Cleanup({ env, trash, recycleSize: async () => 7 * MB, emptyRecycleBin: empty });
    const r = await c.run(
      ['temp', 'browsers', 'recycle'],
      ['big-game-setup.exe', 'recent.pdf', '../escape.txt'],
    );
    const L = env.localAppData;
    expect(existsSync(join(env.temp, 'old-installer.tmp'))).toBe(false);
    expect(existsSync(join(env.temp, 'in-use-now.tmp'))).toBe(true);
    expect(
      existsSync(join(L, 'Google', 'Chrome', 'User Data', 'Default', 'Cache', 'Cache_Data')),
    ).toBe(false);
    expect(existsSync(join(L, 'Google', 'Chrome', 'User Data', 'Default', 'Cache'))).toBe(true); // folder kept
    expect(existsSync(join(L, 'Google', 'Chrome', 'User Data', 'Default', 'Login Data'))).toBe(
      true,
    );
    expect(existsSync(join(L, 'CrashDumps', 'game.dmp'))).toBe(true); // not chosen
    expect(empty).toHaveBeenCalledTimes(1);
    // Only a currently suggested Downloads file, by name, goes to the bin.
    expect(trash).toHaveBeenCalledTimes(1);
    expect(trash).toHaveBeenCalledWith(join(env.downloads, 'big-game-setup.exe'));
    expect(r.freed).toBe(3 * MB + 4 * MB + 7 * MB + 210 * MB);
    expect(r.skipped).toBe(0);
  });

  it('ignores unknown categories', async () => {
    const { env } = machine();
    const r = await new Cleanup({ env }).run(['documents' as never], []);
    expect(r.freed).toBe(0);
  });
});
