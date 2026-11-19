import { shell } from 'electron';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import type { MainContext } from '../context';
import {
  epicGames,
  findGame,
  launchLink,
  steamGames,
  type InstalledGame,
} from '../services/installed-games';

/** Where Steam is installed (from the registry), or null. */
export const steamPath = (): Promise<string | null> =>
  new Promise((resolve) =>
    execFile(
      'reg.exe',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
      { windowsHide: true, timeout: 5000 },
      (err, out) => {
        const m = /SteamPath\s+REG_SZ\s+(.+)/.exec(String(out));
        resolve(err || !m ? null : (m[1] ?? '').trim().replace(/\//g, '\\'));
      },
    ),
  );

/** Installed games for Claude: list them and start one through its store. */
export function registerGames(ctx: MainContext): {
  list(): Promise<InstalledGame[]>;
  tools: Record<string, (input: unknown) => Promise<unknown>>;
} {
  let cache: { at: number; games: InstalledGame[] } | null = null;
  const list = async (): Promise<InstalledGame[]> => {
    if (process.platform !== 'win32') return [];
    if (cache && Date.now() - cache.at < 10 * 60_000) return cache.games;
    const sp = await steamPath();
    const games = [
      ...(sp ? steamGames(sp) : []),
      ...epicGames(
        join(
          process.env.ProgramData ?? 'C:\\ProgramData',
          'Epic',
          'EpicGamesLauncher',
          'Data',
          'Manifests',
        ),
      ),
    ].sort((a, b) => a.name.localeCompare(b.name));
    cache = { at: Date.now(), games };
    return games;
  };
  return {
    list,
    tools: {
      list_installed_games: async () => {
        const g = await list();
        return g.length
          ? g.map((x) => ({
              name: x.name,
              store: x.store,
              ...(x.sizeGB ? { sizeGB: x.sizeGB } : {}),
            }))
          : { games: [], note: 'No Steam or Epic games found on this PC.' };
      },
      launch_game: async (input) => {
        const name = String((input as { name?: unknown } | null)?.name ?? '');
        const g = findGame(await list(), name);
        if (!g) return { error: `No installed Steam or Epic game matches "${name}".` };
        await shell.openExternal(launchLink(g));
        ctx.audit.add('action', `Launched ${g.name} (${g.store})`);
        return { launched: g.name, via: g.store === 'steam' ? 'Steam' : 'Epic Games Launcher' };
      },
    },
  };
}
