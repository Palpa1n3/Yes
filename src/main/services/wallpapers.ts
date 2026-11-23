/** Windows desktop wallpapers: list the user's previous ones (and Windows' own) with previews,
 *  and set one when the user taps it in Settings › Appearance. Only pictures from that list can
 *  be set. */
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { nativeImage } from 'electron';
import { parseRegPaths, wallpaperList, type Wallpaper } from '@shared/wallpapers';

const run = (file: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> =>
  new Promise((resolve) => {
    execFile(
      file,
      args,
      { windowsHide: true, timeout: 15_000, env: { ...process.env, ...env } },
      (_e, out) => resolve(String(out ?? '')),
    );
  });

const KEY_HISTORY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Wallpapers';
const KEY_DESKTOP = 'HKCU\\Control Panel\\Desktop';

/** Pictures in a folder (and one level of sub-folders), newest first. */
function pictures(dir: string, depth = 1): string[] {
  try {
    const out: Array<[number, string]> = [];
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory() && depth > 0)
        out.push(...pictures(p, depth - 1).map((x): [number, string] => [0, x]));
      else if (st.isFile()) out.push([st.mtimeMs, p]);
    }
    return out.sort((a, b) => b[0] - a[0]).map(([, p]) => p);
  } catch {
    return [];
  }
}

function thumb(path: string): string {
  try {
    const img = nativeImage.createFromPath(path);
    if (img.isEmpty()) return '';
    return `data:image/jpeg;base64,${img.resize({ width: 240 }).toJPEG(78).toString('base64')}`;
  } catch {
    return '';
  }
}

let last: Wallpaper[] = [];

export async function listWallpapers(): Promise<Wallpaper[]> {
  if (process.platform !== 'win32') return [];
  const [hist, desk] = await Promise.all([
    run('reg', ['query', KEY_HISTORY]),
    run('reg', ['query', KEY_DESKTOP, '/v', 'WallPaper']),
  ]);
  const current = parseRegPaths(desk)[0] ?? '';
  const cached = pictures(
    join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Themes', 'CachedFiles'),
    0,
  );
  const windows = pictures(join(process.env.WINDIR ?? 'C:\\Windows', 'Web', 'Wallpaper'));
  const list = wallpaperList(current, [...parseRegPaths(hist), ...cached], windows).filter((w) =>
    existsSync(w.path),
  );
  last = list.map((w) => ({ ...w, thumb: thumb(w.path) }));
  return last;
}

/** Set the desktop wallpaper (only to a picture from the last list). */
export async function setWallpaper(path: string): Promise<{ ok: boolean; error?: string }> {
  if (!last.some((w) => w.path === path) || !existsSync(path))
    return { ok: false, error: 'That picture isn’t in the list any more.' };
  const ps = [
    'Add-Type -TypeDefinition \'using System.Runtime.InteropServices; public class AltonWp { [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int SystemParametersInfo(int a, int b, string c, int d); }\';',
    'if ([AltonWp]::SystemParametersInfo(20, 0, $env:ALTON_WALLPAPER, 3) -ne 0) { "ok" } else { "fail" }',
  ].join(' ');
  const out = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    ALTON_WALLPAPER: path,
  });
  if (!out.includes('ok')) return { ok: false, error: 'Windows didn’t accept that picture.' };
  last = last.map((w) => ({ ...w, current: w.path === path }));
  return { ok: true };
}
