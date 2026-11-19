/** Steam downloads: which games are updating (from the app manifests), and a watcher that
 *  does something (shut down, sleep, or just tell the user) once they've all finished. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vdfValues } from './installed-games';

/** Steam's StateFlags bits that mean an update is wanted or under way. */
const UPDATE_REQUIRED = 2;
const FULLY_INSTALLED = 4;
const BUSY =
  256 | // update running
  512 | // update paused
  1024 | // update started
  262144 | // adding files
  524288 | // preallocating
  1048576 | // downloading
  2097152 | // staging
  4194304 | // committing
  131072; // validating
/** Paused or merely waiting: counts as "not done" but not as actively downloading. */
const PAUSED = 512;

export interface SteamApp {
  id: string;
  name: string;
  flags: number;
  /** Bytes still to fetch (0 when unknown). */
  toDownload: number;
  downloaded: number;
  /** Actively downloading/installing now. */
  active: boolean;
  /** An update is wanted, queued, paused or running. */
  pending: boolean;
}

export function parseManifest(text: string, downloadingDir = false): SteamApp | null {
  const id = vdfValues(text, 'appid')[0];
  const name = vdfValues(text, 'name')[0];
  if (!id || !name) return null;
  const flags = Number(vdfValues(text, 'StateFlags')[0]) || 0;
  const toDownload = Number(vdfValues(text, 'BytesToDownload')[0]) || 0;
  const downloaded = Number(vdfValues(text, 'BytesDownloaded')[0]) || 0;
  const busy = (flags & BUSY) !== 0;
  const active =
    (busy && (flags & PAUSED) === 0) ||
    (downloadingDir && toDownload > 0 && downloaded < toDownload);
  const pending =
    busy ||
    (flags & UPDATE_REQUIRED) !== 0 ||
    (flags & FULLY_INSTALLED) === 0 ||
    (toDownload > 0 && downloaded < toDownload);
  return { id, name, flags, toDownload, downloaded, active, pending };
}

/** Every game with an update pending or running, across all Steam libraries. */
export function steamUpdates(steamPath: string): SteamApp[] {
  const libs = new Set<string>([steamPath]);
  const lf = join(steamPath, 'steamapps', 'libraryfolders.vdf');
  try {
    if (existsSync(lf)) for (const p of vdfValues(readFileSync(lf, 'utf8'), 'path')) libs.add(p);
  } catch {
    /* just the main library */
  }
  const out: SteamApp[] = [];
  for (const lib of libs) {
    const apps = join(lib, 'steamapps');
    if (!existsSync(apps)) continue;
    let files: string[];
    try {
      files = readdirSync(apps);
    } catch {
      continue;
    }
    for (const f of files) {
      const m = /^appmanifest_(\d+)\.acf$/.exec(f);
      if (!m) continue;
      try {
        const app = parseManifest(
          readFileSync(join(apps, f), 'utf8'),
          existsSync(join(apps, 'downloading', m[1] ?? '')),
        );
        if (
          app?.pending &&
          !/^(Steamworks Common Redistributables|Proton|Steam Linux Runtime)/i.test(app.name)
        )
          out.push(app);
      } catch {
        /* skip a manifest Steam is writing */
      }
    }
  }
  return out;
}

export const progressText = (a: SteamApp): string =>
  a.toDownload > 0
    ? `${Math.min(100, Math.round((a.downloaded / a.toDownload) * 100))}% of ${(a.toDownload / 1024 ** 3).toFixed(1)} GB`
    : a.active
      ? 'installing'
      : 'waiting';

export type AfterAction = 'shutdown' | 'sleep' | 'notify';

export interface SteamWatchDeps {
  /** Pending updates right now (null when Steam isn't found). */
  read(): Promise<SteamApp[] | null>;
  /** All watched games have finished. */
  done(names: string[], action: AfterAction): void;
  now?: () => number;
}

/** Waits for the games that were updating when it was armed (or one named game) to finish.
 *  "Finished" must be seen on two checks in a row, so a gap between Steam's download and
 *  install steps doesn't count. Gives up after 12 hours. */
export class SteamWatch {
  private armed: { ids: Set<string>; names: string[]; action: AfterAction; at: number } | null =
    null;
  private clearCount = 0;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly d: SteamWatchDeps) {}

  status(): { action: AfterAction; games: string[]; since: number } | null {
    return this.armed
      ? { action: this.armed.action, games: this.armed.names, since: this.armed.at }
      : null;
  }

  /** Start watching. Returns the games being waited for, or a reason it can't. */
  async arm(
    action: AfterAction,
    game = '',
  ): Promise<{ ok: true; games: string[] } | { ok: false; reason: string }> {
    const apps = await this.d.read();
    if (apps === null) return { ok: false, reason: 'Steam isn’t installed on this PC.' };
    const q = game.trim().toLowerCase();
    const picked = q
      ? apps.filter((a) => a.name.toLowerCase().includes(q))
      : apps.filter((a) => a.active);
    if (!picked.length)
      return {
        ok: false,
        reason: q
          ? `“${game}” has no update pending in Steam right now.`
          : apps.length
            ? `Nothing is downloading right now. Waiting (not started): ${apps.map((a) => a.name).join(', ')}. Start it in Steam's Downloads page, or name the game.`
            : 'Nothing is downloading or waiting to update in Steam.',
      };
    this.armed = {
      ids: new Set(picked.map((a) => a.id)),
      names: picked.map((a) => a.name),
      action,
      at: this.d.now?.() ?? Date.now(),
    };
    this.clearCount = 0;
    this.start();
    return { ok: true, games: this.armed.names };
  }

  cancel(): boolean {
    const had = !!this.armed;
    this.armed = null;
    this.stop();
    return had;
  }

  /** One check (exposed for tests). */
  async check(): Promise<void> {
    const a = this.armed;
    if (!a) return;
    if ((this.d.now?.() ?? Date.now()) - a.at > 12 * 3600_000) {
      this.cancel();
      return;
    }
    const apps = await this.d.read().catch(() => null);
    if (!apps) return;
    const still = apps.filter((x) => a.ids.has(x.id));
    this.clearCount = still.length ? 0 : this.clearCount + 1;
    if (this.clearCount >= 2) {
      this.cancel();
      this.d.done(a.names, a.action);
    }
  }

  private start(): void {
    this.stop();
    this.timer = setInterval(() => void this.check(), 30_000);
  }

  private stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
