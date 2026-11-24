import { describe, expect, it } from 'vitest';
import { escPath, fileConflicts, hasRule, olderDuplicates, parseGet } from '@shared/vortex';

describe('Vortex command line helpers', () => {
  it('escapes dots in mod ids and reads --get output', () => {
    expect(escPath('RadioExt 2.92 4591 2.92 2026-10-25T20-46Z')).toBe(
      'RadioExt 2\\.92 4591 2\\.92 2026-10-25T20-46Z',
    );
    const m = parseGet(
      'settings.profiles.lastActiveProfile.cyberpunk2077 = "abc123"\npersistent.mods.cyberpunk2077.X.rules = [{"type":"after","reference":{"id":"Y"}}]\nnoise',
    );
    expect(m.get('settings.profiles.lastActiveProfile.cyberpunk2077')).toBe('abc123');
    expect(m.get('persistent.mods.cyberpunk2077.X.rules')).toEqual([
      { type: 'after', reference: { id: 'Y' } },
    ]);
  });
  it('spots existing rules either way', () => {
    expect(hasRule([{ type: 'after', reference: { id: 'B' } }], [], 'A', 'B')).toBe(true);
    expect(hasRule([], [{ type: 'before', reference: { id: 'A' } }], 'A', 'B')).toBe(true);
    expect(hasRule([{ type: 'requires', reference: { id: 'B' } }], [], 'A', 'B')).toBe(false);
  });
  it('lets patches and then newer mods win file conflicts', () => {
    const c = fileConflicts([
      {
        id: 'cats',
        name: 'Apartment Cats',
        files: ['archive/pc/mod/cats.archive', 'r6/tweaks/cats.yaml'],
        installedAt: 1,
      },
      { id: 'catsfix', name: 'Apartment Cats Fix', files: ['r6/tweaks/cats.yaml'], installedAt: 0 },
      { id: 'old', name: 'Lights', files: ['bin/x64/a.ini', 'readme.txt'], installedAt: 1 },
      { id: 'new', name: 'Better Lights', files: ['bin/x64/A.ini', 'readme.txt'], installedAt: 5 },
    ]);
    expect(c).toEqual([
      { winner: 'catsfix', loser: 'cats', files: 1, reason: 'Apartment Cats Fix is a patch/fix' },
      { winner: 'new', loser: 'old', files: 1, reason: 'Better Lights is newer' },
    ]);
  });
});

describe('older copies of the same mod', () => {
  it('switches off the older version when both deploy the same files', () => {
    expect(
      olderDuplicates([
        {
          id: 'Shift-22340-1-11-1-1772169176',
          name: 'Shift',
          nexusId: 22340,
          files: ['bin/a.lua'],
          installedAt: 1,
        },
        {
          id: 'Shift 22340 1.14.0 2026-10-26T18-15Z x',
          name: 'Shift',
          nexusId: 22340,
          files: ['bin/A.lua'],
          installedAt: 9,
        },
        {
          id: 'Optional-22340',
          name: 'Shift extras',
          nexusId: 22340,
          files: ['bin/extra.lua'],
          installedAt: 5,
        },
        { id: 'Other', name: 'Other', nexusId: 7, files: ['bin/a.lua'], installedAt: 3 },
      ]),
    ).toEqual([
      {
        id: 'Shift-22340-1-11-1-1772169176',
        name: 'Shift',
        newer: 'Shift 22340 1.14.0 2026-10-26T18-15Z x',
      },
    ]);
  });
});
