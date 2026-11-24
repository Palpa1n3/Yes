import { describe, expect, it } from 'vitest';
import { describeFix, ignoredPlugins, planFixes, setIgnored } from '@shared/cpfix';

const INI = `# See https://docs.red4ext.com/getting-started/configuration

version = 0

[logging]
level = "info"

[plugins]
enabled = true
ignored = []

[dev]
console = false
`;

describe('RED4ext ignore list', () => {
  it('adds and removes plugins without touching anything else', () => {
    const one = setIgnored(INI, 'RadioExt', true);
    expect(ignoredPlugins(one)).toEqual(['RadioExt']);
    expect(one).toContain('ignored = ["RadioExt"]');
    expect(one).toContain('[dev]\nconsole = false');
    const two = setIgnored(one, 'OldThing', true);
    expect(ignoredPlugins(two)).toEqual(['RadioExt', 'OldThing']);
    expect(setIgnored(two, 'radioext', true)).toBe(two);
    expect(ignoredPlugins(setIgnored(two, 'RadioExt', false))).toEqual(['OldThing']);
    expect(setIgnored(one, 'RadioExt', false)).toBe(INI);
  });
  it('adds the section when the config has none', () => {
    const ini = setIgnored('version = 0\n', 'RadioExt', true);
    expect(ignoredPlugins(ini)).toEqual(['RadioExt']);
  });
});

describe('planning fixes', () => {
  const report = { culprit: { plugin: 'RadioExt', times: 12 }, outdated: ['RadioExt'] };
  const redmod = {
    failed: true,
    stage: 'Script Compilation',
    error: 'Script compilation has failed!',
    scriptMods: ['NCPD Prevention Police Enhancement'],
  };
  it('switches off a crashing plugin and redeploys REDmod without script mods', () => {
    const plan = planFixes({
      report,
      redmod,
      culpritMod: { name: 'RadioExt 2.81', modId: 4591 },
      updateFor: null,
      ignored: [],
      redmodSkipped: [],
    });
    expect(plan).toEqual([
      { kind: 'ignore-plugin', plugin: 'RadioExt', mod: 'RadioExt 2.81' },
      { kind: 'redmod-without', mods: ['NCPD Prevention Police Enhancement'] },
    ]);
    expect(describeFix(plan[0]!)).toMatch(/Switched off the RadioExt plugin/);
  });
  it('updates instead when Nexus has a newer version, and never repeats a fix', () => {
    expect(
      planFixes({
        report,
        redmod: null,
        culpritMod: { name: 'RadioExt', modId: 4591 },
        updateFor: { modId: 4591, name: 'RadioExt' },
        ignored: [],
        redmodSkipped: [],
      }),
    ).toEqual([{ kind: 'update', modId: 4591, name: 'RadioExt', plugin: 'RadioExt' }]);
    expect(
      planFixes({
        report,
        redmod,
        culpritMod: null,
        updateFor: null,
        ignored: ['radioext'],
        redmodSkipped: ['NCPD Prevention Police Enhancement'],
      }),
    ).toEqual([]);
  });
});

describe('crash fixes', () => {
  it('switches off a plugin the game keeps crashing in while playing', () => {
    const plan = planFixes({
      report: { culprit: null, outdated: [] },
      redmod: null,
      culpritMod: null,
      updateFor: null,
      ignored: [],
      redmodSkipped: [],
      crashCulprit: { plugin: 'SomeMod', mod: 'Some Mod 1.2' },
    });
    expect(plan).toEqual([
      { kind: 'ignore-plugin', plugin: 'SomeMod', mod: 'Some Mod 1.2', why: 'crash' },
    ]);
    expect(describeFix(plan[0]!)).toMatch(/kept crashing inside it while you played/);
    expect(
      planFixes({
        report: { culprit: null, outdated: [] },
        redmod: null,
        culpritMod: null,
        updateFor: null,
        ignored: ['SomeMod'],
        redmodSkipped: [],
        crashCulprit: { plugin: 'SomeMod', mod: 'Some Mod' },
      }),
    ).toEqual([]);
  });
});

describe('load order fixes', () => {
  it('describes the moves', () => {
    expect(
      describeFix({
        kind: 'load-order',
        moves: [{ archive: 'Cats Patch.archive', before: 'Apartment Cats.archive' }],
        previous: null,
      }),
    ).toBe('Fixed the load order so patches win: Cats Patch ahead of Apartment Cats.');
  });
});
