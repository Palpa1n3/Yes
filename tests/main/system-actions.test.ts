import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toCommand } from '@shared/commands';
import { AppRegistry } from '../../src/main/services/app-registry';
import {
  createExecutor,
  processNamesFor,
  type ExecutorDeps,
} from '../../src/main/services/command-executor';
import {
  createSystemActions,
  insideRoots,
  isSafeProcessName,
  searchFiles,
  type SystemActions,
} from '../../src/main/services/system-actions';
import { TimerService } from '../../src/main/services/timer-service';
import { toIntent } from '../../src/main/services/anthropic-provider';
import { plan } from '../../src/main/services/ai-provider';
import { DEFAULT_PERSONALITY } from '@shared/personalities';
import { snapshot } from '../../src/main/services/system-stats';

function fakeSystem(over: Partial<SystemActions> = {}): SystemActions {
  return {
    closeApp: vi.fn(async (names: string[]) => ({
      ok: true,
      message: `Asked ${names[0]} to close.`,
    })),
    setVolume: vi.fn(async ({ level, mute }) => ({ level: level ?? 40, muted: mute ?? false })),
    mediaKey: vi.fn(async () => undefined),
    lockScreen: vi.fn(async () => undefined),
    openFolder: vi.fn(async () => true),
    findFiles: vi.fn(async () => [
      { path: 'C:\\Users\\me\\Documents\\invoice-october.pdf', size: 1, modified: 0 },
    ]),
    revealFile: vi.fn(async () => true),
    setTimer: vi.fn(() => new Date(2026, 0, 1, 12, 30)),
    cancelTimers: vi.fn((q: string) => (q === 'oven' ? ['check the oven'] : [])),
    ...over,
  };
}

function exec(system?: SystemActions) {
  const registry = new AppRegistry(join(mkdtempSync(join(tmpdir(), 'arc-')), 'apps.json'));
  registry.load();
  const deps: ExecutorDeps = {
    platform: 'win32',
    registry,
    env: {},
    fileExists: () => false,
    spawnDetached: vi.fn(async () => undefined),
    openExternal: vi.fn(async () => undefined),
    listStartApps: vi.fn(async () => []),
    uriHandlerExists: vi.fn(async () => false),
    system,
  };
  return { run: createExecutor(deps), registry };
}
const cmd = (action: string, target?: string, args?: string[]) =>
  toCommand({ action, target, args }, 'c');

describe('new actions through the executor', () => {
  it('close_app: resolves process names and is marked destructive (asks first)', async () => {
    const sys = fakeSystem();
    const { run, registry } = exec(sys);
    expect(cmd('close_app', 'opera').risk).toBe('destructive');
    expect(processNamesFor('VS Code', registry)).toEqual(['Code', 'vscode']);
    expect(processNamesFor('opera', registry)).toEqual(['opera']);
    expect(await run(cmd('close_app', 'Opera'))).toMatchObject({ status: 'success' });
    expect(sys.closeApp).toHaveBeenCalledWith(['opera']);
    expect(await run(cmd('close_app', ''))).toMatchObject({ status: 'failed' });
  });

  it('set_volume: validates level and passes mute', async () => {
    const sys = fakeSystem();
    const { run } = exec(sys);
    expect(await run(cmd('set_volume', '30'))).toMatchObject({
      status: 'success',
      message: 'Volume is 30%.',
    });
    expect(await run(cmd('set_volume', '', ['mute']))).toMatchObject({
      message: 'Muted (volume 40%).',
    });
    expect(await run(cmd('set_volume', '150'))).toMatchObject({ status: 'failed' });
    expect(await run(cmd('set_volume', ''))).toMatchObject({ status: 'failed' });
  });

  it('media, folders, files, timer, lock', async () => {
    const sys = fakeSystem();
    const { run } = exec(sys);
    expect(await run(cmd('media_control', 'next'))).toMatchObject({
      status: 'success',
      message: 'Next track sent to your media player.',
    });
    expect(await run(cmd('media_control', 'explode'))).toMatchObject({ status: 'failed' });
    expect(await run(cmd('open_folder', 'Downloads'))).toMatchObject({ status: 'success' });
    expect(await run(cmd('open_folder', 'system32'))).toMatchObject({ status: 'failed' });
    expect((await run(cmd('find_files', 'invoice'))).message).toMatch(
      /Found 1 file:\n.*invoice-october\.pdf/,
    );
    expect(await run(cmd('reveal_file', 'C:\\x.pdf'))).toMatchObject({ status: 'success' });
    expect(await run(cmd('set_timer', '10', ['stretch']))).toMatchObject({ status: 'success' });
    expect(sys.setTimer).toHaveBeenCalledWith(10, 'stretch');
    expect(await run(cmd('set_timer', '0'))).toMatchObject({ status: 'failed' });
    expect(await run(cmd('set_timer', '9999'))).toMatchObject({ status: 'failed' });
    expect(await run(cmd('lock_screen'))).toMatchObject({ status: 'success' });
  });

  it('reports errors from the OS layer and missing support readably', async () => {
    const { run } = exec(
      fakeSystem({
        setVolume: vi.fn(async () =>
          Promise.reject(new Error("Couldn't reach the Windows volume control.")),
        ),
      }),
    );
    expect(await run(cmd('set_volume', '20'))).toMatchObject({
      status: 'failed',
      message: "Couldn't reach the Windows volume control.",
    });
    const { run: none } = exec(undefined);
    expect(await none(cmd('lock_screen'))).toMatchObject({
      status: 'failed',
      message: "That action isn't available on this system.",
    });
  });
});

describe('system-actions safety and helpers', () => {
  afterEach(() => vi.useRealTimers());

  it('never closes Windows itself or ARC', () => {
    for (const n of ['explorer', 'Explorer.exe', 'svchost', 'electron', 'arc', 'csrss'])
      expect(isSafeProcessName(n)).toBe(false);
    expect(isSafeProcessName('opera')).toBe(true);
    expect(isSafeProcessName('evil"; rm -rf /')).toBe(false);
  });

  it('only reveals files inside the user folders', () => {
    const roots = ['/home/me/Documents', '/home/me/Downloads'];
    expect(insideRoots('/home/me/Documents/a/b.pdf', roots)).toBe(true);
    expect(insideRoots('/home/me/Documents/../.ssh/id_rsa', roots)).toBe(false);
    expect(insideRoots('/etc/passwd', roots)).toBe(false);
    expect(insideRoots('relative.txt', roots)).toBe(false);
    expect(insideRoots('/home/me/Documents', roots)).toBe(false);
  });

  it('searchFiles matches all words, skips noisy folders, newest first', async () => {
    const root = mkdtempSync(join(tmpdir(), 'arc-find-'));
    mkdirSync(join(root, 'sub', 'node_modules'), { recursive: true });
    writeFileSync(join(root, 'Invoice October.pdf'), 'x');
    writeFileSync(join(root, 'sub', 'invoice-october-final.pdf'), 'x');
    writeFileSync(join(root, 'sub', 'node_modules', 'invoice-october.js'), 'x');
    writeFileSync(join(root, 'invoice-march.pdf'), 'x');
    const old = new Date(2020, 0, 1);
    utimesSync(join(root, 'Invoice October.pdf'), old, old);
    const hits = await searchFiles([root], 'october invoice');
    expect(hits.map((h) => h.path.replace(root, ''))).toEqual([
      join('/sub', 'invoice-october-final.pdf'),
      '/Invoice October.pdf',
    ]);
  });

  it('non-Windows actions say so', async () => {
    const sys = createSystemActions({
      platform: 'linux',
      getPath: () => '/nope',
      openPath: async () => '',
      showItemInFolder: vi.fn(),
      timers: new TimerService({ onChange: vi.fn(), onRing: vi.fn() }),
    });
    await expect(sys.lockScreen()).rejects.toThrow(/only available on Windows/);
    await expect(sys.closeApp(['opera'])).rejects.toThrow(/only available on Windows/);
  });

  it('cancel_timer reports what it cancelled', async () => {
    const { run } = exec(fakeSystem());
    expect(await run(cmd('cancel_timer', 'oven'))).toMatchObject({
      status: 'success',
      message: 'Cancelled check the oven.',
    });
    expect(await run(cmd('cancel_timer', 'pasta'))).toMatchObject({
      status: 'failed',
      message: 'No timer matching “pasta”.',
    });
  });
});

describe('Claude tools and offline phrasing', () => {
  it('validates the new tool inputs', () => {
    expect(toIntent('set_volume', { level: 30 })).toEqual({
      intent: { action: 'set_volume', target: '30' },
    });
    expect(toIntent('set_volume', { mute: true })).toEqual({
      intent: { action: 'set_volume', target: '', args: ['mute'] },
    });
    expect(toIntent('set_volume', {})).toHaveProperty('error');
    expect(toIntent('media_control', { action: 'next' })).toEqual({
      intent: { action: 'media_control', target: 'next' },
    });
    expect(toIntent('media_control', { action: 'rewind' })).toHaveProperty('error');
    expect(toIntent('set_timer', { minutes: 20, label: 'check the oven' })).toEqual({
      intent: { action: 'set_timer', target: '20', args: ['check the oven'] },
    });
    expect(toIntent('set_timer', { minutes: -1 })).toHaveProperty('error');
    expect(toIntent('lock_screen', {})).toEqual({ intent: { action: 'lock_screen' } });
    expect(toIntent('close_app', { app: 'opera' })).toEqual({
      intent: { action: 'close_app', target: 'opera' },
    });
  });

  it('offline mode understands everyday phrasings', () => {
    const p = (t: string) =>
      plan(t, 0, snapshot, { personality: DEFAULT_PERSONALITY, userName: '' }).intent;
    expect(p('open my downloads')).toEqual({ action: 'open_folder', target: 'downloads' });
    expect(p('open spotify')).toMatchObject({ target: 'spotify' }); // still a launch
    expect(p('close opera')).toEqual({ action: 'close_app', target: 'opera' });
    expect(p('set volume to 30')).toEqual({ action: 'set_volume', target: '30' });
    expect(p('mute')).toEqual({ action: 'set_volume', target: '', args: ['mute'] });
    expect(p('pause the music')).toEqual({ action: 'media_control', target: 'play_pause' });
    expect(p('next song')).toEqual({ action: 'media_control', target: 'next' });
    expect(p('remind me in 20 minutes to check the oven')).toEqual({
      action: 'set_timer',
      target: '20',
      args: ['check the oven'],
    });
    expect(p('set a timer for 90 seconds')).toEqual({ action: 'set_timer', target: '1.5' });
    expect(p('lock my pc')).toEqual({ action: 'lock_screen' });
    expect(p('cancel the oven timer')).toEqual({ action: 'cancel_timer', target: 'oven' });
    expect(p('cancel all timers')).toEqual({ action: 'cancel_timer', target: 'all' });
    expect(p('stop the alarm')).toEqual({ action: 'cancel_timer', target: 'all' });
    expect(p('find invoice october')).toEqual({ action: 'find_files', target: 'invoice october' });
  });
});
