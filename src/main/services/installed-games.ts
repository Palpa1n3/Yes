/** Installed games from Steam (library folders + app manifests) and the Epic Games Launcher
 *  (manifests). Read-only; launching goes through the store's own steam:// / epic:// links. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface InstalledGame {
  name: string;
  store: 'steam' | 'epic';
  /** Steam app id or Epic app name. */
  id: string;
  dir: string;
  sizeGB?: number;
}

/** Values for a key in Valve's KeyValues text ("path"		"D:\\SteamLibrary"). */
export function vdfValues(text: string, key: string): string[] {
  const re = new RegExp(`"${key}"\\s+"((?:[^"\\\\]|\\\\.)*)"`, 'gi');
  return [...text.matchAll(re)].map((m) => (m[1] ?? '').replace(/\\\\/g, '\\'));
}

export function steamGames(steamPath: string): InstalledGame[] {
  const libs = new Set<string>([steamPath]);
  const lf = join(steamPath, 'steamapps', 'libraryfolders.vdf');
  if (existsSync(lf)) for (const p of vdfValues(readFileSync(lf, 'utf8'), 'path')) libs.add(p);
  const games: InstalledGame[] = [];
  for (const lib of libs) {
    const apps = join(lib, 'steamapps');
    if (!existsSync(apps)) continue;
    for (const f of readdirSync(apps)) {
      if (!/^appmanifest_\d+\.acf$/.test(f)) continue;
      try {
        const t = readFileSync(join(apps, f), 'utf8');
        const id = vdfValues(t, 'appid')[0];
        const name = vdfValues(t, 'name')[0];
        const dir = vdfValues(t, 'installdir')[0];
        const size = Number(vdfValues(t, 'SizeOnDisk')[0]);
        // Skip Steam's own runtimes/redistributables.
        if (
          !id ||
          !name ||
          /^(Steamworks Common Redistributables|Proton|Steam Linux Runtime)/i.test(name)
        )
          continue;
        games.push({
          name,
          store: 'steam',
          id,
          dir: join(apps, 'common', dir ?? name),
          ...(size > 0 ? { sizeGB: Math.round((size / 1024 ** 3) * 10) / 10 } : {}),
        });
      } catch {
        /* skip a broken manifest */
      }
    }
  }
  return games;
}

export function epicGames(manifestDir: string): InstalledGame[] {
  if (!existsSync(manifestDir)) return [];
  const out: InstalledGame[] = [];
  for (const f of readdirSync(manifestDir)) {
    if (!f.endsWith('.item')) continue;
    try {
      const j = JSON.parse(readFileSync(join(manifestDir, f), 'utf8')) as Record<string, unknown>;
      const name = String(j.DisplayName ?? '');
      const id = String(j.AppName ?? '');
      const cats = Array.isArray(j.AppCategories) ? j.AppCategories.map(String) : ['games'];
      if (!name || !id || !cats.includes('games')) continue;
      const size = Number(j.InstallSize);
      out.push({
        name,
        store: 'epic',
        id,
        dir: String(j.InstallLocation ?? ''),
        ...(size > 0 ? { sizeGB: Math.round((size / 1024 ** 3) * 10) / 10 } : {}),
      });
    } catch {
      /* skip */
    }
  }
  return out;
}

/** Store link that starts the game. */
export const launchLink = (g: InstalledGame): string =>
  g.store === 'steam'
    ? `steam://rungameid/${encodeURIComponent(g.id)}`
    : `com.epicgames.launcher://apps/${encodeURIComponent(g.id)}?action=launch&silent=true`;

/** Best match for a spoken name ("fortnite", "cyberpunk"). */
export function findGame(games: InstalledGame[], query: string): InstalledGame | null {
  const q = query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!q) return null;
  const norm = (n: string): string =>
    n
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return (
    games.find((g) => norm(g.name) === q) ??
    games.find((g) => norm(g.name).startsWith(q)) ??
    games.find((g) => norm(g.name).includes(q)) ??
    games.find((g) => q.split(' ').every((w) => norm(g.name).includes(w))) ??
    null
  );
}
