import { describe, expect, it } from 'vitest';
import {
  findUpdates,
  hasUpdate,
  isVortexInternal,
  needsCheck,
  parseModFolder,
  searchMods,
  versionNewer,
  type NexusInfo,
} from '@shared/cpmods';

const info = (p: Partial<NexusInfo> & { modId: number }): NexusInfo => ({
  name: 'Mod',
  version: '',
  updatedAt: 0,
  fileId: 1,
  available: true,
  checkedAt: 0,
  ...p,
});

describe('Cyberpunk mods from Vortex', () => {
  it('reads both of Vortex’s folder name styles', () => {
    expect(parseModFolder('ACU - Character Customization-3850-3-2-1-1777741508')).toEqual({
      folder: 'ACU - Character Customization-3850-3-2-1-1777741508',
      name: 'ACU - Character Customization',
      modId: 3850,
      version: '3.2.1',
      installedAt: 1777741508000,
    });
    expect(parseModFolder('AdaptiveSliders-5075-2024-06-10-1718017645')).toMatchObject({
      modId: 5075,
      version: '2024-06-10',
    });
    expect(
      parseModFolder('AccidentalFastTravelBugFix 36600 1.0.0.0 2026-10-30T22-20Z VquAqYExL'),
    ).toMatchObject({
      name: 'AccidentalFastTravelBugFix',
      modId: 36600,
      version: '1.0.0.0',
      installedAt: Date.UTC(2026, 9, 30, 22, 20),
    });
    expect(parseModFolder('My own tweaks')).toMatchObject({ modId: null, version: '' });
  });
  it('compares versions sensibly', () => {
    expect(versionNewer('1.2.1', '1.2.10')).toBe(true);
    expect(versionNewer('v2.0', '2.0.0')).toBe(false);
    expect(versionNewer('3.2.1', '3.1')).toBe(false);
    expect(versionNewer('beta', '1.0')).toBeNull();
    expect(versionNewer('1.1.3.for.2.31', '1.1.3')).toBe(false);
    expect(versionNewer('cd.2.0.1', '2.0.2')).toBe(true);
    expect(isVortexInternal('__vortex_tmp_00000006')).toBe(true);
    expect(isVortexInternal('vortex.deployment.msgpack')).toBe(true);
    expect(isVortexInternal('Cats-6329-2-2-1-1740787060')).toBe(false);
  });
  it('offers updates by version, or by date when versions don’t say', () => {
    const m = parseModFolder('Thing-10-1-0-1700000000');
    expect(hasUpdate(m, info({ modId: 10, version: '1.1' }))).toBe(true);
    expect(hasUpdate(m, info({ modId: 10, version: '1.0' }))).toBe(false);
    expect(hasUpdate(m, info({ modId: 10, version: '1.1', available: false }))).toBe(false);
    const d = parseModFolder('Dated-11-2024-06-10-1718017645');
    expect(
      hasUpdate(
        d,
        info({ modId: 11, version: 'latest', updatedAt: 1718017645000 + 3 * 86_400_000 }),
      ),
    ).toBe(true);
    expect(
      hasUpdate(d, info({ modId: 11, version: 'latest', updatedAt: 1718017645000 + 3_600_000 })),
    ).toBe(false);
  });
  it('lists each mod once, using its newest install', () => {
    const mods = [
      parseModFolder('Cats-6329-2-2-0-1700000000'),
      parseModFolder('Cats-6329-2-2-1-1740787060'),
      parseModFolder('Other-77-1-0-1700000000'),
    ];
    const u = findUpdates(
      mods,
      new Map([
        [6329, info({ modId: 6329, version: '2.2.1' })],
        [77, info({ modId: 77, version: '1.5' })],
      ]),
    );
    expect(u.map((x) => x.mod.modId)).toEqual([77]);
  });
  it('only asks Nexus about new, stale or changed mods', () => {
    const now = 100 * 86_400_000;
    const cache = new Map([
      [1, info({ modId: 1, checkedAt: now - 86_400_000 })],
      [2, info({ modId: 2, checkedAt: now - 10 * 86_400_000 })],
      [3, info({ modId: 3, checkedAt: now - 86_400_000 })],
    ]);
    const changed = new Map([[3, now - 3_600_000]]);
    expect(needsCheck([1, 2, 3, 4, 4], cache, changed, now)).toEqual([2, 3, 4]);
  });
  it('finds mods by name', () => {
    const mods = [
      'Apartment Cats - Dogtown-10325-1-1-0-1710981667',
      'ACU-3850-3-2-1-1777741508',
    ].map(parseModFolder);
    expect(searchMods(mods, 'cats dog').map((m) => m.modId)).toEqual([10325]);
  });
});
