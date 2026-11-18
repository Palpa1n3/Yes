import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { toCommand } from '@shared/commands';
import { AppRegistry, DEFAULT_APPS } from '../../src/main/services/app-registry';
import {
  createExecutor,
  expandPath,
  matchStartApp,
  toWebUrl,
  type ExecutorDeps,
  type StartApp,
} from '../../src/main/services/command-executor';

const START_APPS: StartApp[] = [
  { name: 'Spotify', appId: 'SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify' },
  { name: 'Spotify Uninstaller', appId: 'x!uninstall' },
  { name: 'Google Chrome', appId: 'Chrome' },
  { name: 'Visual Studio Code', appId: 'Microsoft.VisualStudioCode' },
  { name: 'Steam', appId: 'C:\\Program Files (x86)\\Steam\\steam.exe' },
  { name: 'Blender 4.5', appId: 'blender' },
];

function setup(over: Partial<ExecutorDeps> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'arc-'));
  const registry = new AppRegistry(join(dir, 'apps.json'));
  registry.load();
  const deps = {
    platform: 'win32' as NodeJS.Platform,
    registry,
    env: { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' },
    fileExists: vi.fn(() => false),
    spawnDetached: vi.fn(async () => undefined),
    openExternal: vi.fn(async () => undefined),
    listStartApps: vi.fn(async () => START_APPS),
    uriHandlerExists: vi.fn(async () => true),
    ...over,
  };
  return { deps, run: createExecutor(deps), dir };
}
const launch = (target: string) => toCommand({ action: 'open app', target }, 'c1');

describe('launch_app on Windows', () => {
  it('opens Spotify through the Start menu (works for Store and desktop installs)', async () => {
    const { deps, run } = setup();
    const r = await run(launch('spotify'));
    expect(r).toMatchObject({ status: 'success', message: 'Opened Spotify.' });
    expect(deps.spawnDetached).toHaveBeenCalledWith('explorer.exe', [
      'shell:AppsFolder\\SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify',
    ]);
  });

  it('resolves friendly names and intent phrases via apps.json', async () => {
    const { deps, run } = setup();
    expect(await run(launch('vs code'))).toMatchObject({
      status: 'success',
      message: 'Opened VS Code.',
    });
    expect(await run(launch('play music'))).toMatchObject({ message: 'Opened Spotify.' });
    expect(deps.spawnDetached).toHaveBeenCalledWith('explorer.exe', [
      'shell:AppsFolder\\Microsoft.VisualStudioCode',
    ]);
  });

  it('launches bare system executables directly', async () => {
    const { deps, run } = setup();
    await run(launch('calculator'));
    expect(deps.spawnDetached).toHaveBeenCalledWith('calc.exe', []);
  });

  it('finds installed apps that are not in apps.json', async () => {
    const { deps, run } = setup();
    expect(await run(launch('blender'))).toMatchObject({
      status: 'success',
      message: 'Opened Blender 4.5.',
    });
    expect(deps.spawnDetached).toHaveBeenCalledWith('explorer.exe', ['shell:AppsFolder\\blender']);
  });

  it('falls back to the app URI when the Start menu has no match', async () => {
    const { deps, run } = setup({ listStartApps: vi.fn(async () => []) });
    expect(await run(launch('spotify'))).toMatchObject({ status: 'success' });
    expect(deps.openExternal).toHaveBeenCalledWith('spotify:');
  });

  it('does not claim success via a link no installed app handles', async () => {
    const { deps, run } = setup({
      listStartApps: vi.fn(async () => []),
      uriHandlerExists: vi.fn(async () => false),
    });
    const r = await run(launch('spotify'));
    expect(r).toMatchObject({
      status: 'failed',
      message: "Spotify doesn't appear to be installed.",
    });
    expect(deps.openExternal).not.toHaveBeenCalled();
    expect(deps.uriHandlerExists).toHaveBeenCalledWith('spotify');
  });

  it('fails honestly when an app is not installed', async () => {
    const { deps, run } = setup({ listStartApps: vi.fn(async () => []) });
    const r = await run(launch('nonexistent app'));
    expect(r.status).toBe('failed');
    expect(r.message).toMatch(/couldn't find “nonexistent app” installed/);
    expect(deps.spawnDetached).not.toHaveBeenCalled();
    const d = await run(launch('discord')); // in apps.json but not installed, and no URI
    expect(d).toMatchObject({
      status: 'failed',
      message: "Discord doesn't appear to be installed.",
    });
  });

  it('checks explicit paths exist before spawning, with a readable error', async () => {
    const { run, deps, dir } = setup();
    const file = join(dir, 'apps.json');
    const apps = JSON.parse(readFileSync(file, 'utf8'));
    apps.push({ id: 'tool', name: 'My Tool', path: '%LOCALAPPDATA%\\Tool\\tool.exe', intents: [] });
    writeFileSync(file, JSON.stringify(apps));
    deps.registry.load();
    const r = await run(launch('my tool'));
    expect(r).toMatchObject({
      status: 'failed',
      message:
        "My Tool isn't at C:\\Users\\me\\AppData\\Local\\Tool\\tool.exe. Update its path in apps.json.",
    });
    expect(deps.spawnDetached).not.toHaveBeenCalled();
  });

  it('reports spawn errors instead of claiming success', async () => {
    const { run } = setup({
      spawnDetached: vi.fn(async () => Promise.reject(new Error('ENOENT'))),
      listStartApps: vi.fn(async () => []),
    });
    const r = await run(launch('calculator'));
    expect(r.status).toBe('failed');
    expect(r.message).toMatch(/ENOENT/);
  });
});

describe('web actions', () => {
  it('opens URLs and searches in the default browser', async () => {
    const { deps, run } = setup();
    expect(await run(toCommand({ action: 'go to', target: 'github.com' }, 'u'))).toMatchObject({
      status: 'success',
      message: 'Opened github.com.',
    });
    expect(deps.openExternal).toHaveBeenCalledWith('https://github.com/');
    await run(toCommand({ action: 'web search', target: 'cheap flights & hotels' }, 's'));
    expect(deps.openExternal).toHaveBeenCalledWith(
      'https://www.google.com/search?q=cheap%20flights%20%26%20hotels',
    );
  });

  it('refuses non-web schemes from the AI', async () => {
    const { deps, run } = setup();
    const r = await run(toCommand({ action: 'go to', target: 'file:///C:/Windows/System32' }, 'u'));
    expect(r.status).toBe('failed');
    expect(deps.openExternal).not.toHaveBeenCalled();
    expect(toWebUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('helpers', () => {
  it('matchStartApp prefers exact names and skips uninstallers', () => {
    expect(matchStartApp(START_APPS, 'spotify')?.appId).toMatch(/SpotifyMusic/);
    expect(matchStartApp(START_APPS, 'chrome')?.name).toBe('Google Chrome');
    expect(matchStartApp(START_APPS, 'nothing here')).toBeUndefined();
  });

  it('expandPath handles %VAR%, $VAR and ~', () => {
    const env = { LOCALAPPDATA: 'C:\\L', HOME: '/home/me' };
    expect(expandPath('%LOCALAPPDATA%\\x.exe', env)).toBe('C:\\L\\x.exe');
    expect(expandPath('~/bin/x', env)).toBe('/home/me/bin/x');
    expect(expandPath('%NOPE%\\x', env)).toBe('%NOPE%\\x');
  });

  it('apps.json is seeded on first run and survives a corrupt file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arc-'));
    const file = join(dir, 'apps.json');
    const reg = new AppRegistry(file);
    expect(reg.load()).toHaveLength(DEFAULT_APPS.length);
    writeFileSync(file, '{ not json');
    expect(reg.load()).toEqual(DEFAULT_APPS);
  });
});
