import { describe, expect, it } from 'vitest';
import {
  collectOutdated,
  definesRecord,
  ownerIndex,
  ownerOf,
  redscriptErrorFiles,
  tweakRecordIds,
} from '@shared/cpoutdated';

const index = ownerIndex([
  {
    folder: 'RadioExt 2.81-4591-2-81-1758186017',
    files: [
      'red4ext/plugins/RadioExt/RadioExt.dll',
      'red4ext/plugins/RadioExt/__folder_managed_by_vortex',
    ],
  },
  {
    folder: 'NCPDPPE V2.7 ARCADE-9863-2-7-1765558378',
    files: ['mods/NCPD Prevention Police Enhancement/info.json'],
  },
  { folder: 'Misoru Foods-1-1-0-1700000000', files: ['r6\\tweaks\\misoru\\boomerang.yaml'] },
  {
    folder: 'Gangers-2-1-0-1700000000',
    files: ['r6/scripts/CrowdGangers/Combat/TurfWarning.reds'],
  },
]);
const mods = [
  { folder: 'RadioExt 2.81-4591-2-81-1758186017', name: 'RadioExt 2.81', modId: 4591 },
  { folder: 'NCPDPPE V2.7 ARCADE-9863-2-7-1765558378', name: 'NCPDPPE V2.7 ARCADE', modId: 9863 },
  { folder: 'Misoru Foods-1-1-0-1700000000', name: 'Misoru Foods', modId: 1 },
  { folder: 'Gangers-2-1-0-1700000000', name: 'Gangers', modId: 2 },
];

describe('outdated mods', () => {
  it('finds which Vortex mod installed a file or folder', () => {
    expect(ownerOf(index, 'RED4EXT\\plugins\\RadioExt')).toBe('RadioExt 2.81-4591-2-81-1758186017');
    expect(ownerOf(index, 'r6/tweaks/misoru/boomerang.yaml')).toBe('Misoru Foods-1-1-0-1700000000');
    expect(ownerOf(index, 'r6/scripts/nothing.reds')).toBeNull();
  });
  it('reads TweakXL’s rejected records and redscript’s error files', () => {
    expect(
      tweakRecordIds(
        '[2026] [1] [error] Items.Misoru_BoomerangWraithWeaponModAbility.effectors[2]: Cannot inline\n[2026] [1] [info] Reading x\n[2026] [1] [error] Vehicle.bmw_r_ninet.burnOut: Missing type',
      ),
    ).toEqual(['Items.Misoru_BoomerangWraithWeaponModAbility', 'Vehicle.bmw_r_ninet']);
    expect(
      definesRecord(
        'Items.Misoru_BoomerangWraithWeaponModAbility:\n  $type: x',
        'Items.Misoru_BoomerangWraithWeaponModAbility',
      ),
    ).toBe(true);
    expect(
      definesRecord(
        'other: Items.Misoru_BoomerangWraithWeaponModAbility',
        'Items.Misoru_BoomerangWraithWeaponModAbility',
      ),
    ).toBe(false);
    expect(
      redscriptErrorFiles(
        '[ERROR - Tue] At C:\\Games\\Cyberpunk 2077\\r6\\scripts\\CrowdGangers\\Combat\\TurfWarning.reds:12:3:\n[WARN - Tue] At C:\\x\\r6\\scripts\\Other.reds:1:1:',
      ),
    ).toEqual(['r6/scripts/CrowdGangers/Combat/TurfWarning.reds']);
  });
  it('lists each mod once with every reason, and notes updates', () => {
    const out = collectOutdated(
      {
        oldPlugins: ['RadioExt'],
        crashPlugins: ['RadioExt'],
        redmodScripts: ['NCPD Prevention Police Enhancement'],
        scriptErrors: ['r6/scripts/CrowdGangers/Combat/TurfWarning.reds'],
        tweakFiles: [{ file: 'r6/tweaks/misoru/boomerang.yaml', record: 'Items.Misoru_Boomerang' }],
        gameVersion: '2.50',
      },
      index,
      mods,
      new Set([9863]),
    );
    expect(out.map((m) => m.name)).toEqual([
      'RadioExt 2.81',
      'Gangers',
      'Misoru Foods',
      'NCPDPPE V2.7 ARCADE',
    ]);
    expect(out[0]?.reasons).toEqual([
      'Its RED4ext plugin (RadioExt) is older than the game’s 2.50 update.',
      'The game kept crashing inside its plugin (RadioExt).',
    ]);
    expect(out.find((m) => m.modId === 9863)?.hasUpdate).toBe(true);
  });
});
