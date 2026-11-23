import { describe, expect, it } from 'vitest';
import { parseRegPaths, wallpaperList } from '@shared/wallpapers';
import { FLAT_BACKDROPS, isBackdrop } from '@shared/backdrops';
import { sanitizeSettings } from '@shared/settings';

const REG = `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Wallpapers
    BackgroundHistoryPath1    REG_SZ    C:\\Users\\Me\\Pictures\\space.png
    BackgroundHistoryPath0    REG_SZ    C:\\Users\\Me\\Pictures\\car.jpg
    BackgroundType    REG_DWORD    0x0
`;

describe('Windows wallpapers', () => {
  it('reads the wallpaper history from the registry, newest first', () => {
    expect(parseRegPaths(REG)).toEqual([
      'C:\\Users\\Me\\Pictures\\car.jpg',
      'C:\\Users\\Me\\Pictures\\space.png',
    ]);
    expect(
      parseRegPaths('    WallPaper    REG_SZ    C:\\Users\\Me\\Pictures\\car.jpg\r\n'),
    ).toEqual(['C:\\Users\\Me\\Pictures\\car.jpg']);
  });
  it('lists the current one first, then the rest, without repeats or non-pictures', () => {
    const l = wallpaperList(
      'C:\\Users\\Me\\Pictures\\Car.JPG',
      [
        'C:\\Users\\Me\\Pictures\\car.jpg',
        'C:\\Users\\Me\\Pictures\\space.png',
        'C:\\x\\notes.txt',
      ],
      ['C:\\Windows\\Web\\Wallpaper\\Windows\\img0.jpg'],
    );
    expect(l.map((w) => [w.name, w.group, w.current])).toEqual([
      ['Car', 'yours', true],
      ['space', 'yours', false],
      ['img0', 'windows', false],
    ]);
  });
});

describe('PC backgrounds', () => {
  it('include the phone’s backgrounds, and settings keep them', () => {
    expect(FLAT_BACKDROPS.map((b) => b.id)).toContain('aurora');
    expect(isBackdrop('nebula')).toBe(true);
    expect(isBackdrop('horizon')).toBe(true);
    expect(isBackdrop('photo')).toBe(false);
    expect(sanitizeSettings({ backdrop: 'ocean' }).backdrop).toBe('ocean');
    expect(sanitizeSettings({ backdrop: 'nope' }).backdrop).toBe('none');
  });
});
