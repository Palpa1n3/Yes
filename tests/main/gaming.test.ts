import { describe, expect, it, vi } from 'vitest';
import { gameLabel, isGame } from '@shared/gaming';
import { sanitizeSettings } from '@shared/settings';
import { GamingMode, parsePowerScheme, type GamingSettings } from '../../src/main/services/gaming';

describe('spotting games', () => {
  it('knows popular games and game library folders, not launchers', () => {
    expect(isGame('cod', null)).toBe(true);
    expect(isGame('Cyberpunk2077.exe', null)).toBe(true);
    expect(isGame('VALORANT-Win64-Shipping', null)).toBe(true);
    expect(
      isGame('SomeIndie', 'D:\\SteamLibrary\\steamapps\\common\\SomeIndie\\SomeIndie.exe'),
    ).toBe(true);
    expect(
      isGame('javaw', 'C:\\Users\\J\\curseforge\\minecraft\\Install\\runtime\\bin\\javaw.exe'),
    ).toBe(true);
    expect(isGame('steam', 'C:\\Program Files (x86)\\Steam\\steam.exe')).toBe(false);
    expect(
      isGame('steamwebhelper', 'D:\\SteamLibrary\\steamapps\\common\\x\\steamwebhelper.exe'),
    ).toBe(false);
    expect(
      isGame(
        'UnityCrashHandler64',
        'D:\\SteamLibrary\\steamapps\\common\\G\\UnityCrashHandler64.exe',
      ),
    ).toBe(false);
    expect(isGame('chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')).toBe(
      false,
    );
    expect(isGame('MyGame', null, ['mygame.exe'])).toBe(true);
    expect(gameLabel('cod')).toBe('Call of Duty');
    expect(gameLabel('Palworld-Win64-Shipping')).toBe('Palworld');
  });

  it('reads the active power plan', () => {
    expect(
      parsePowerScheme('Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced)'),
    ).toBe('381b4222-f694-41f0-9685-ff5bb260df2e');
    expect(parsePowerScheme('nothing')).toBeNull();
  });

  it('sanitises gaming settings', () => {
    const s = sanitizeSettings({
      gamingMode: true,
      gamingCloseApps: ['Chrome', 'Chrome', 'bad/name', 7],
      gamingGames: 'x',
    });
    expect(s).toMatchObject({
      gamingMode: true,
      gamingPowerPlan: true,
      gamingQuiet: true,
      gamingCloseApps: ['Chrome'],
      gamingGames: [],
    });
    expect(sanitizeSettings({}).gamingMode).toBe(false);
  });
});

describe('GamingMode', () => {
  function setup(over: Partial<GamingSettings> = {}) {
    let procs: Array<{ name: string; path: string | null }> = [{ name: 'explorer', path: null }];
    let plan = 'balanced-guid';
    const settings: GamingSettings = {
      enabled: true,
      powerPlan: true,
      closeApps: ['Chrome', 'OneDrive'],
      extraGames: [],
      ...over,
    };
    const closeApp = vi.fn(async (n: string) => n === 'Chrome'); // OneDrive wasn't running
    const launchApp = vi.fn(async () => true);
    const onChange = vi.fn();
    const g = new GamingMode({
      listProcesses: async () => procs,
      settings: () => settings,
      getPowerPlan: async () => plan,
      setPowerPlan: async (p) => {
        plan = p === 'high' ? 'high-guid' : p;
        return true;
      },
      closeApp,
      launchApp,
      onChange,
    });
    return {
      g,
      closeApp,
      launchApp,
      onChange,
      settings,
      plan: () => plan,
      play: (p: typeof procs) => (procs = p),
    };
  }

  it('boosts when a game starts and puts everything back after it closes', async () => {
    const t = setup();
    await t.g.poll();
    expect(t.g.get().active).toBe(false);
    t.play([{ name: 'Cyberpunk2077', path: null }]);
    await t.g.poll();
    expect(t.g.get()).toMatchObject({
      active: true,
      game: 'Cyberpunk 2077',
      actions: ['High performance power plan', 'Closed Chrome'],
    });
    expect(t.plan()).toBe('high-guid');
    t.play([]);
    await t.g.poll(); // one miss: could be a loading screen
    expect(t.g.get().active).toBe(true);
    await t.g.poll();
    expect(t.g.get().active).toBe(false);
    expect(t.plan()).toBe('balanced-guid');
    expect(t.launchApp).toHaveBeenCalledTimes(1);
    expect(t.launchApp).toHaveBeenCalledWith('Chrome');
    expect(t.onChange).toHaveBeenCalledTimes(2);
  });

  it('can be started and ended by hand, and does nothing when switched off', async () => {
    const t = setup({ enabled: false, powerPlan: false, closeApps: [] });
    t.play([{ name: 'cod', path: null }]);
    await t.g.poll();
    expect(t.g.get().active).toBe(false);
    await t.g.start();
    expect(t.g.get()).toMatchObject({ active: true, manual: true });
    await t.g.poll(); // manual mode isn't ended by polling
    expect(t.g.get().active).toBe(true);
    await t.g.stop();
    expect(t.g.get().active).toBe(false);
  });
});
