import { describe, expect, it } from 'vitest';
import {
  definesSymbol,
  mainFiles,
  missingDeps,
  parseRedRequire,
  parseRequirements,
  providesName,
} from '@shared/cpdeps';
import { sameDownloadCopies } from '@shared/vortex';

describe('Cyberpunk mod dependencies', () => {
  const reqs = parseRequirements({
    data: {
      legacyModsByDomain: {
        nodes: [
          {
            modId: 4591,
            name: 'RadioExt',
            modRequirements: {
              nexusRequirements: {
                nodes: [
                  {
                    modId: '107',
                    gameId: '3333',
                    modName: 'Cyber Engine Tweaks',
                    externalRequirement: false,
                  },
                  { modId: '2380', gameId: '3333', modName: 'RED4ext', externalRequirement: false },
                  { modId: '9', gameId: '3333', modName: 'Outside', externalRequirement: true },
                ],
              },
            },
          },
          {
            modId: 21481,
            name: 'Virtual Atelier',
            modRequirements: {
              nexusRequirements: {
                nodes: [
                  {
                    modId: '21482',
                    gameId: '3333',
                    modName: 'VA Delivery',
                    externalRequirement: false,
                  },
                ],
              },
            },
          },
          {
            modId: 5,
            name: 'Saved one',
            modRequirements: {
              nexusRequirements: {
                nodes: [{ modId: '77', gameId: '3333', modName: 'X', externalRequirement: false }],
              },
            },
          },
        ],
      },
    },
  });
  it('reads the Nexus answer', () => {
    expect(reqs).toHaveLength(3);
    expect(reqs[0]?.requires[0]).toEqual({
      modId: '107',
      gameId: '3333',
      modName: 'Cyber Engine Tweaks',
      externalRequirement: false,
    });
    expect(parseRequirements(null)).toEqual([]);
  });
  it('lists only what is missing', () => {
    const d = missingDeps(new Set([4591, 107, 21481, 5, 2380]), new Set([2380, 5]), reqs);
    expect(d).toEqual([
      { modId: 2380, name: 'RED4ext', neededBy: ['RadioExt'], saved: true },
      { modId: 21482, name: 'VA Delivery', neededBy: ['Virtual Atelier'], saved: false },
    ]);
  });
});

describe('same-download copies in Vortex', () => {
  it('keeps the copies that are on, else the newest', () => {
    expect(
      sameDownloadCopies([
        { id: 'a-new', archiveId: 'A', variant: '', enabled: true, installedAt: 9 },
        { id: 'a-old', archiveId: 'A', variant: '', enabled: false, installedAt: 1 },
        { id: 'a-var', archiveId: 'A', variant: 'v2', enabled: false, installedAt: 1 },
        { id: 'b1', archiveId: 'B', variant: '', enabled: false, installedAt: 1 },
        { id: 'b2', archiveId: 'B', variant: '', enabled: false, installedAt: 5 },
        { id: 'c', archiveId: '', variant: '', enabled: false, installedAt: 5 },
      ]),
    ).toEqual(['a-old', 'b1']);
  });
});

describe('which Nexus files to install', () => {
  it('takes the primary main file plus newer hotfixes', () => {
    const f = (id: number, name: string, category: string, at: number, primary = false) => ({
      id,
      name,
      category,
      at,
      primary,
    });
    expect(
      mainFiles([
        f(65492, 'RPO 2.0 BETA - Main File', 'OLD_VERSION', 1),
        f(175098, 'Ragdoll Physics Overhaul 3.0 BETA', 'MAIN', 10, true),
        f(175106, 'Disable MaxTac Crash Fix', 'OPTIONAL', 11),
        f(175215, 'RPO 3.0 HOTFIX - SlowMo-Related Crash', 'MAIN', 12),
      ]).map((x) => x.id),
    ).toEqual([175098, 175215]);
    expect(
      mainFiles([f(1, 'Mod', 'MAIN', 5), f(2, 'Mod hotfix', 'MAIN', 9)]).map((x) => x.id),
    ).toEqual([1, 2]);
    expect(mainFiles([f(1, 'Old', 'OLD_VERSION', 5)])).toEqual([]);
  });
});

describe('RedRequire report', () => {
  const report = `RedRequire report - the script compile failed
Redscript reported 23 errors.

* ImmersiveVDialogueExpanded requires AudioXL, which you do not have.
  (missing)
  missing: AudioXL, AudioXLAPI
    C:/G/r6/scripts/x.reds:15  [UNRESOLVED_IMPORT] module AudioXL has no members

* RagdollPhysicsOverhaul requires a newer mod_settings than yours.
  (needs newer)
  missing: RPO_ArmActiveRagdoll, RPO_Log
`;
  it('reads what each failing mod needs', () => {
    expect(parseRedRequire(report)).toEqual([
      {
        mod: 'ImmersiveVDialogueExpanded',
        needs: 'AudioXL',
        newer: false,
        symbols: ['AudioXL', 'AudioXLAPI'],
      },
      {
        mod: 'RagdollPhysicsOverhaul',
        needs: 'mod_settings',
        newer: true,
        symbols: ['RPO_ArmActiveRagdoll', 'RPO_Log'],
      },
    ]);
  });
  it('finds where a name is defined', () => {
    expect(definesSymbol('module AudioXL\n', 'AudioXL')).toBe(true);
    expect(definesSymbol('module AudioXL.Equalizer\n', 'AudioXL')).toBe(false);
    expect(definesSymbol('public static native func RPO_Log(s: String) -> Void;', 'RPO_Log')).toBe(
      true,
    );
    expect(definesSymbol('@addMethod(PlayerPuppet)\npublic func RPO_LogX() {}', 'RPO_Log')).toBe(
      false,
    );
    expect(definesSymbol('  RPO_Log("x");', 'RPO_Log')).toBe(false);
    expect(definesSymbol('public class AudioXLAPI extends IScriptable {', 'AudioXLAPI')).toBe(true);
  });
  it('matches the mod that provides a name', () => {
    expect(providesName(['red4ext\\plugins\\AudioXL\\AudioXL.dll'], 'audioxl')).toBe(true);
    expect(providesName(['r6/scripts/AudioXLEqualizer/a.reds'], 'AudioXL')).toBe(false);
  });
});
