import { describe, expect, it, vi } from 'vitest';
import { DownloadMode, type DownloadModeDeps } from '../../src/main/services/download-mode';
import type { SteamApp } from '../../src/main/services/steam-watch';

const app = (id: string, name: string, active: boolean, to = 100, done = 50): SteamApp => ({
  id,
  name,
  flags: active ? 1030 : 6,
  toDownload: to,
  downloaded: done,
  active,
  pending: true,
});

function make(steam: () => SteamApp[] | null, extra: Partial<DownloadModeDeps> = {}) {
  const base = {
    running: vi.fn(async () => [
      { name: 'OneDrive', path: 'C:\\OneDrive\\OneDrive.exe' },
      { name: 'Dropbox', path: 'C:\\Dropbox\\Dropbox.exe' },
      { name: 'chrome', path: 'C:\\chrome.exe' },
    ]),
    close: vi.fn(async (name: string) => name.length > 0),
    reopen: vi.fn(async (path: string) => void path),
    steamPriority: vi.fn(async () => true),
    keepAwake: vi.fn(),
    steam: vi.fn(async () => steam()),
    steamLimit: vi.fn(async () => 0),
    onChange: vi.fn(),
    finished: vi.fn(),
  };
  const d = { ...base, ...extra } as typeof base;
  return { m: new DownloadMode(d), d };
}

describe('download mode', () => {
  it('pauses bandwidth hogs (not the browser), boosts Steam and keeps the PC awake', async () => {
    const { m, d } = make(() => [app('1', 'Big Game', true)]);
    const s = await m.start();
    expect('error' in s).toBe(false);
    expect(d.close.mock.calls.map((c) => c[0])).toEqual(['OneDrive', 'Dropbox']);
    expect(d.steamPriority).toHaveBeenCalledWith(true);
    expect(d.keepAwake).toHaveBeenCalledWith(true);
    expect(m.get().games).toEqual([{ name: 'Big Game', progress: '50% of 0.0 GB' }]);
    await m.stop();
    expect(d.reopen.mock.calls.map((c) => c[0])).toEqual([
      'C:\\OneDrive\\OneDrive.exe',
      'C:\\Dropbox\\Dropbox.exe',
    ]);
    expect(d.steamPriority).toHaveBeenLastCalledWith(false);
    expect(d.keepAwake).toHaveBeenLastCalledWith(false);
  });

  it('ends by itself after two clear checks and passes on the follow-up', async () => {
    let list: SteamApp[] = [app('1', 'Big Game', true), app('2', 'Queued', false)];
    const { m, d } = make(() => list);
    await m.start('shutdown');
    await m.check();
    expect(d.finished).not.toHaveBeenCalled();
    list = [app('2', 'Queued', false)]; // the queued one never starts: it doesn't hold things up
    await m.check();
    expect(d.finished).not.toHaveBeenCalled();
    await m.check();
    expect(d.finished).toHaveBeenCalledWith(['Big Game'], 'shutdown');
    expect(m.get().active).toBe(false);
  });

  it('warns about a Steam download limit, and refuses without Steam', async () => {
    const { m } = make(() => [app('1', 'G', true)], { steamLimit: vi.fn(async () => 5120) });
    const s = await m.start();
    expect(!('error' in s) && s.notes.join(' ')).toContain('download limit of 5 MB/s');
    const none = make(() => null);
    expect(await none.m.start()).toEqual({ error: 'Steam isn’t installed on this PC.' });
  });
});
