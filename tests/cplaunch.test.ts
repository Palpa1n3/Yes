import { describe, expect, it } from 'vitest';
import { diagnoseLaunch, readRun, redmodReport, type LaunchLog } from '@shared/cplaunch';

const P = 'C:\\Games\\Cyberpunk 2077\\red4ext\\plugins';
const line = (t: string, msg: string): string => `[${t}.000] [info    ] [ 1] [RED4ext] ${msg}`;
const log = (stamp: string, version: string, body: string[]): LaunchLog => {
  const t = stamp.replace(/^(\d{4}-\d{2}-\d{2})-(\d{2})-(\d{2})-(\d{2})$/, '$1 $2:$3:$4');
  return {
    name: `red4ext-${stamp}.log`,
    text: [
      line(t, 'RED4ext (v1.30.0) is initializing...'),
      line(t, `Product version: ${version}`),
      ...body.map((b) => line(t, b)),
    ].join('\n'),
  };
};
const good = (stamp: string, v: string): LaunchLog =>
  log(stamp, v, [
    `Loading plugin from '${P}\\TweakXL\\TweakXL.dll'...`,
    'TweakXL (version: 1.12) has been loaded',
    '9 plugin(s) loaded',
    'RED4ext has been started',
    'scc invoked successfully, 35633 source refs were registered',
    '9 plugin(s) unloaded',
    'RED4ext has been shut down',
  ]);
const stuck = (stamp: string, plugin: string): LaunchLog =>
  log(stamp, '2.50', [
    `Loading plugin from '${P}\\ACU\\acu_rs.dll'...`,
    'acu-rs (version: 4.1.8) has been loaded',
    `Loading plugin from '${P}\\${plugin}\\${plugin}.dll'...`,
  ]);

describe('why Cyberpunk won’t start', () => {
  it('reads how far a launch got', () => {
    expect(readRun(good('2026-10-23-16-36-08', '2.31'))).toMatchObject({
      outcome: 'closed',
      gameVersion: '2.31',
      loaded: 1,
    });
    expect(readRun(stuck('2026-11-23-22-54-07', 'RadioExt'))).toMatchObject({
      outcome: 'stopped-loading',
      stoppedOn: 'RadioExt',
      stoppedFile: 'RadioExt',
      loaded: 1,
    });
  });
  it('names the plugin it keeps stopping on, and plugins older than the patch', () => {
    const day = (s: string): number => new Date(`${s}T12:00`).getTime();
    const r = diagnoseLaunch(
      [
        good('2026-10-23-16-36-08', '2.31'),
        stuck('2026-10-24-19-27-26', 'ACU'),
        stuck('2026-11-23-22-52-24', 'RadioExt'),
        stuck('2026-11-23-22-54-07', 'RadioExt'),
      ],
      [
        { plugin: 'RadioExt', modified: day('2025-09-18') },
        { plugin: 'OldThing', modified: day('2026-01-01') },
        { plugin: 'TweakXL', modified: day('2026-11-13') },
      ],
    );
    expect(r.gameVersion).toBe('2.50');
    expect(r.culprit).toEqual({ plugin: 'RadioExt', times: 2 });
    expect(r.outdated).toEqual(['OldThing', 'RadioExt']);
    expect(r.lastGood).toBe(new Date(2026, 9, 23, 16, 36, 8).getTime());
    expect(r.verdict).toMatch(
      /while loading the RED4ext plugin “RadioExt” \(2 launches in a row\)\. It’s older than the game’s 2\.50 update/,
    );
    expect(r.verdict).toMatch(/Also older than the update: OldThing/);
  });
  it('points past the plugins when they all load, and shows script errors', () => {
    const r = diagnoseLaunch(
      [log('2026-11-24-10-00-00', '2.50', ['9 plugin(s) loaded', 'RED4ext has been started'])],
      [],
      '[INFO - x] ok\n[ERROR - Tue] At C:\\...\\mod.reds:12: unknown type',
    );
    expect(r.culprit).toBeNull();
    expect(r.verdict).toMatch(/got past loading the mod plugins/);
    expect(r.scriptErrors).toHaveLength(1);
    expect(diagnoseLaunch([], []).verdict).toMatch(/no RED4ext launch logs/);
  });
});

describe('REDmod deploys', () => {
  const run = (mods: string[], tail: string): string =>
    [
      'Copyright (c) 2022-26 CD Projekt Red. All Rights Reserved.',
      '[DEPLOY] Stage 1/10 - Initialization',
      ...mods,
      'Needs deployment: true',
      tail,
    ].join('\n');
  it('names the script mods when the script compile fails', () => {
    const ok = run(
      ['Found mod "A" (v1) in folder "A" (enabled; deployed (v1); )'],
      'Commandlet deploy has succeeded.',
    );
    const bad = run(
      [
        'Found mod "Cyberarms Patch" (v1.7) in folder "Cyberarms Patch" (enabled; not deployed; )',
        'Found mod "NCPD Prevention Police Enhancement" (v2.7 ARCADE) in folder "NCPD Prevention Police Enhancement" (enabled; not deployed; TWEAKS; SCRIPTS; )',
      ],
      '[DEPLOY] Stage 2/10 - Script Compilation\nERROR: Script compilation has failed!\n\nCommandlet deploy has failed.',
    );
    const r = redmodReport(`${ok}\n${bad}`);
    expect(r).toMatchObject({
      failed: true,
      stage: 'Script Compilation',
      error: 'Script compilation has failed!',
      scriptMods: ['NCPD Prevention Police Enhancement'],
    });
    expect(r?.verdict).toMatch(/change game scripts: NCPD Prevention Police Enhancement/);
    expect(redmodReport(ok)?.failed).toBe(false);
    expect(redmodReport('')).toBeNull();
  });
});
