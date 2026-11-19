/** Download mode: give Steam the connection. Closes bandwidth-hungry background apps
 *  (reopened afterwards), raises Steam's priority, keeps the PC awake, warns about a Steam
 *  download limit, and ends by itself when Steam has finished (optionally shutting down). */
import { BANDWIDTH_HOGS, IDLE_DOWNLOAD, type DownloadStatus } from '@shared/gaming';
import { progressText, type SteamApp } from './steam-watch';

export interface RunningApp {
  name: string;
  path: string | null;
}

export interface DownloadModeDeps {
  /** Running processes (name without .exe, and path when known). */
  running(): Promise<RunningApp[]>;
  /** Close an app by process name; true if it was running and is now closed. */
  close(name: string): Promise<boolean>;
  /** Start an app again from its path. */
  reopen(path: string): Promise<void>;
  steamPriority(high: boolean): Promise<boolean>;
  keepAwake(on: boolean): void;
  /** Pending Steam updates; null when Steam isn't installed. */
  steam(): Promise<SteamApp[] | null>;
  /** Steam's own download limit in KB/s (0 = none), if it can be read. */
  steamLimit(): Promise<number>;
  onChange(s: DownloadStatus): void;
  /** Downloads finished (or there was nothing to wait for); `then` is the follow-up. */
  finished(names: string[], then: DownloadStatus['then']): void;
  now?: () => number;
}

export class DownloadMode {
  private status: DownloadStatus = { ...IDLE_DOWNLOAD };
  private reopenPaths: string[] = [];
  private seen = new Map<string, string>();
  private clear = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private busy = false;

  constructor(private readonly d: DownloadModeDeps) {}

  get(): DownloadStatus {
    return { ...this.status, games: [...this.status.games], closed: [...this.status.closed] };
  }

  async start(then: DownloadStatus['then'] = 'none'): Promise<DownloadStatus | { error: string }> {
    if (this.status.active) {
      this.status.then = then;
      this.d.onChange(this.get());
      return this.get();
    }
    if (this.busy) return { error: 'Download mode is starting.' };
    this.busy = true;
    try {
      const apps = await this.d.steam();
      if (apps === null) return { error: 'Steam isn’t installed on this PC.' };
      const notes: string[] = [];
      const closed: string[] = [];
      this.reopenPaths = [];
      const running = await this.d.running().catch(() => []);
      for (const hog of BANDWIDTH_HOGS) {
        const proc = running.find((p) => p.name.toLowerCase() === hog.toLowerCase());
        if (!proc) continue;
        if (await this.d.close(proc.name).catch(() => false)) {
          closed.push(proc.name);
          if (proc.path) this.reopenPaths.push(proc.path);
        }
      }
      if (closed.length) notes.push(`Paused ${closed.join(', ')} (reopened afterwards)`);
      if (await this.d.steamPriority(true).catch(() => false))
        notes.push('Steam set to high priority');
      this.d.keepAwake(true);
      notes.push('PC kept awake');
      const limit = await this.d.steamLimit().catch(() => 0);
      if (limit > 0)
        notes.push(
          `Steam has a download limit of ${Math.round(limit / 1024) || 1} MB/s: turn it off in Steam › Settings › Downloads › Limit bandwidth`,
        );
      // Only games actually downloading count (queued ones may never start).
      this.seen = new Map(apps.filter((a) => a.active).map((a) => [a.id, a.name]));
      this.clear = 0;
      this.status = {
        active: true,
        since: this.d.now?.() ?? Date.now(),
        games: apps.map((a) => ({ name: a.name, progress: progressText(a) })),
        closed,
        notes,
        then,
      };
      this.d.onChange(this.get());
      this.timer = setInterval(() => void this.check(), 15_000);
      return this.get();
    } finally {
      this.busy = false;
    }
  }

  /** End it and put everything back. */
  async stop(): Promise<DownloadStatus> {
    if (!this.status.active) return this.get();
    clearInterval(this.timer);
    this.timer = undefined;
    await this.d.steamPriority(false).catch(() => false);
    this.d.keepAwake(false);
    for (const p of this.reopenPaths) await this.d.reopen(p).catch(() => undefined);
    this.reopenPaths = [];
    this.status = { ...IDLE_DOWNLOAD };
    this.d.onChange(this.get());
    return this.get();
  }

  /** One check (exposed for tests): update progress; finish after two clear checks. */
  async check(): Promise<void> {
    if (!this.status.active) return;
    const apps = (await this.d.steam().catch(() => null)) ?? [];
    // Waiting-but-not-started updates don't keep it going; downloading or installing does.
    const working = apps.filter((a) => a.active);
    for (const a of working) this.seen.set(a.id, a.name);
    this.status.games = apps.map((a) => ({ name: a.name, progress: progressText(a) }));
    this.d.onChange(this.get());
    const elapsed = (this.d.now?.() ?? Date.now()) - this.status.since;
    if (working.length) {
      this.clear = 0;
      return;
    }
    this.clear++;
    // Give Steam a few minutes to start if nothing was downloading at first.
    if (this.clear >= 2 && (this.seen.size > 0 || elapsed > 10 * 60_000)) {
      const names = [...this.seen.values()];
      const then = this.status.then;
      await this.stop();
      this.d.finished(names, then);
    }
  }
}
