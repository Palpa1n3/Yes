/** Windows desktop wallpapers: the ones the user had before (Windows keeps the last few in the
 *  registry) and Windows' own. Pure helpers; tested in tests/wallpapers.test.ts. */

export interface Wallpaper {
  path: string;
  /** "Your last wallpapers" or "Windows". */
  group: 'yours' | 'windows';
  name: string;
  current: boolean;
  /** Small JPEG preview (data URL), '' if it couldn't be read. */
  thumb: string;
}

const IMAGE = /\.(jpe?g|png|bmp|gif|webp|jfif|tiff?|heic)$/i;
export const isImagePath = (p: string): boolean => IMAGE.test(p);

/** Paths from `reg query` output: BackgroundHistoryPath0…4 (newest first) or WallPaper. */
export function parseRegPaths(out: string): string[] {
  const found: Array<[number, string]> = [];
  for (const line of out.split(/\r?\n/)) {
    const m = /^\s+(BackgroundHistoryPath(\d+)|WallPaper)\s+REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/i.exec(
      line,
    );
    if (m?.[3]) found.push([m[2] ? Number(m[2]) : -1, m[3]]);
  }
  return found.sort((a, b) => a[0] - b[0]).map(([, p]) => p);
}

/** The wallpaper list: the current one first, then the user's history, then Windows' own;
 *  no repeats (paths compared without case), only pictures. */
export function wallpaperList(
  current: string,
  history: string[],
  windows: string[],
): Array<Pick<Wallpaper, 'path' | 'group' | 'name' | 'current'>> {
  const seen = new Set<string>();
  const out: Array<Pick<Wallpaper, 'path' | 'group' | 'name' | 'current'>> = [];
  const add = (p: string, group: Wallpaper['group']): void => {
    const k = p.trim().toLowerCase();
    if (!k || seen.has(k) || !isImagePath(p)) return;
    seen.add(k);
    const name = (p.split(/[\\/]/).pop() ?? p).replace(IMAGE, '');
    out.push({ path: p.trim(), group, name, current: k === current.trim().toLowerCase() });
  };
  add(current, 'yours');
  for (const p of history) add(p, 'yours');
  for (const p of windows) add(p, 'windows');
  return out.slice(0, 40);
}
