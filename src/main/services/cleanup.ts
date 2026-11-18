/** Sizes and clears a fixed set of cache/temp folders (contents only, never the folders
 *  themselves). Paths come from the environment, never from the renderer. */
import { existsSync, lstatSync, readdirSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BIG_FILE,
  CLEANUP_INFO,
  OLD_FILE_DAYS,
  type BigFile,
  type CleanupId,
  type CleanupItem,
  type CleanupResult,
  type CleanupScan,
} from '@shared/cleanup';

const DAY = 86_400_000;

export interface CleanupEnv {
  temp: string;
  downloads: string;
  localAppData?: string;
  appData?: string;
}

/** Folders whose *contents* each category clears. Missing ones are skipped. */
export function cleanupTargets(env: CleanupEnv): Record<Exclude<CleanupId, 'recycle'>, string[]> {
  const L = env.localAppData;
  const R = env.appData;
  const under = (base: string | undefined, ...parts: string[]): string[] =>
    base ? [join(base, ...parts)] : [];
  // Every browser profile's cache folders (Default, Profile 1, …).
  const chromium = (root: string | undefined): string[] => {
    if (!root || !existsSync(root)) return [];
    let profiles: string[] = [];
    try {
      profiles = readdirSync(root).filter((d) => d === 'Default' || /^Profile \d+$/.test(d));
    } catch {
      /* unreadable */
    }
    return profiles.flatMap((p) =>
      ['Cache', 'Code Cache', 'GPUCache'].map((c) => join(root, p, c)),
    );
  };
  const firefox = (): string[] => {
    const root = L ? join(L, 'Mozilla', 'Firefox', 'Profiles') : '';
    if (!root || !existsSync(root)) return [];
    try {
      return readdirSync(root).map((p) => join(root, p, 'cache2'));
    } catch {
      return [];
    }
  };
  return {
    temp: [env.temp],
    crash: [
      ...under(L, 'CrashDumps'),
      ...under(L, 'Microsoft', 'Windows', 'WER', 'ReportArchive'),
      ...under(L, 'Microsoft', 'Windows', 'WER', 'ReportQueue'),
    ],
    browsers: [
      ...chromium(L && join(L, 'Google', 'Chrome', 'User Data')),
      ...chromium(L && join(L, 'Microsoft', 'Edge', 'User Data')),
      ...chromium(L && join(L, 'BraveSoftware', 'Brave-Browser', 'User Data')),
      ...under(L, 'Opera Software', 'Opera Stable', 'Cache'),
      ...under(L, 'Opera Software', 'Opera GX Stable', 'Cache'),
      ...firefox(),
    ],
    shaders: [
      ...under(L, 'NVIDIA', 'DXCache'),
      ...under(L, 'NVIDIA', 'GLCache'),
      ...under(L, 'AMD', 'DxCache'),
      ...under(L, 'D3DSCache'),
    ],
    launchers: [
      ...under(L, 'Steam', 'htmlcache'),
      ...under(L, 'EpicGamesLauncher', 'Saved', 'webcache'),
      ...under(L, 'EpicGamesLauncher', 'Saved', 'webcache_4147'),
      ...under(R, 'discord', 'Cache'),
      ...under(R, 'discord', 'Code Cache'),
      ...under(R, 'discord', 'GPUCache'),
    ],
  };
}

/** Bytes and file count under `dir` (not following links), within a time budget. */
export function sizeOf(
  dir: string,
  opts: { olderThan?: number; deadline?: number } = {},
): { bytes: number; files: number } {
  let bytes = 0;
  let files = 0;
  const stack = [dir];
  while (stack.length) {
    if (opts.deadline && Date.now() > opts.deadline) break;
    const d = stack.pop() as string;
    let names: string[];
    try {
      names = readdirSync(d);
    } catch {
      continue;
    }
    for (const n of names) {
      const p = join(d, n);
      try {
        const st = lstatSync(p);
        if (st.isSymbolicLink()) continue;
        if (st.isDirectory()) stack.push(p);
        else if (!opts.olderThan || st.mtimeMs < opts.olderThan) {
          bytes += st.size;
          files++;
        }
      } catch {
        /* vanished or locked */
      }
    }
  }
  return { bytes, files };
}

/** Delete what's inside `dir` (optionally only older entries); locked files are skipped. */
export async function clearContents(
  dir: string,
  olderThan?: number,
): Promise<{ freed: number; skipped: number }> {
  if (!existsSync(dir)) return { freed: 0, skipped: 0 };
  let freed = 0;
  let skipped = 0;
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return { freed: 0, skipped: 1 };
  }
  for (const n of names) {
    const p = join(dir, n);
    try {
      const st = lstatSync(p);
      if (olderThan && st.mtimeMs >= olderThan) continue;
      const before = st.isDirectory() ? sizeOf(p).bytes : st.size;
      await rm(p, { recursive: true, force: true, maxRetries: 0 });
      const left = existsSync(p)
        ? statSync(p).isDirectory()
          ? sizeOf(p).bytes
          : statSync(p).size
        : 0;
      freed += Math.max(0, before - left);
      if (left > 0) skipped++;
    } catch {
      skipped++;
    }
  }
  return { freed, skipped };
}

export interface CleanupDeps {
  env: CleanupEnv;
  now?: () => number;
  recycleSize?(): Promise<number>;
  emptyRecycleBin?(): Promise<boolean>;
  /** Move a Downloads file to the Recycle Bin. */
  trash?(path: string): Promise<void>;
}

export class Cleanup {
  private readonly now: () => number;
  constructor(private readonly d: CleanupDeps) {
    this.now = d.now ?? Date.now;
  }

  private olderThan(id: CleanupId): number | undefined {
    return id === 'temp' ? this.now() - DAY : undefined;
  }

  async scan(): Promise<CleanupScan> {
    const targets = cleanupTargets(this.d.env);
    const deadline = this.now() + 25_000;
    const items: CleanupItem[] = [];
    for (const id of Object.keys(targets) as Array<keyof typeof targets>) {
      let bytes = 0;
      let files = 0;
      for (const dir of targets[id]) {
        if (!existsSync(dir)) continue;
        const r = sizeOf(dir, { olderThan: this.olderThan(id), deadline });
        bytes += r.bytes;
        files += r.files;
      }
      items.push({ id, ...CLEANUP_INFO[id], bytes, files });
    }
    if (this.d.recycleSize) {
      const bytes = await this.d.recycleSize().catch(() => 0);
      items.push({ id: 'recycle', ...CLEANUP_INFO.recycle, bytes, files: 0 });
    }
    return { items: items.sort((a, b) => b.bytes - a.bytes), downloads: this.bigDownloads() };
  }

  /** Big (≥200 MB) or old (6 months+) files in the top of Downloads, biggest first. */
  bigDownloads(): BigFile[] {
    const dir = this.d.env.downloads;
    const old = this.now() - OLD_FILE_DAYS * DAY;
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return [];
    }
    const out: BigFile[] = [];
    for (const name of names) {
      try {
        const p = join(dir, name);
        const st = lstatSync(p);
        if (st.isSymbolicLink()) continue;
        const size = st.isDirectory() ? sizeOf(p, { deadline: this.now() + 2000 }).bytes : st.size;
        if (size >= BIG_FILE || (st.mtimeMs < old && size > 10 * 1024 ** 2))
          out.push({ name, size, modified: st.mtimeMs });
      } catch {
        /* skip */
      }
    }
    return out.sort((a, b) => b.size - a.size).slice(0, 40);
  }

  async run(ids: CleanupId[], downloadNames: string[]): Promise<CleanupResult> {
    const targets = cleanupTargets(this.d.env);
    let freed = 0;
    let skipped = 0;
    for (const id of new Set(ids)) {
      if (id === 'recycle') {
        if (this.d.recycleSize && this.d.emptyRecycleBin) {
          const before = await this.d.recycleSize().catch(() => 0);
          if (await this.d.emptyRecycleBin().catch(() => false)) freed += before;
          else skipped++;
        }
        continue;
      }
      if (!(id in targets)) continue;
      for (const dir of targets[id as keyof typeof targets]) {
        const r = await clearContents(dir, this.olderThan(id));
        freed += r.freed;
        skipped += r.skipped;
      }
    }
    // Downloads: only names currently listed as big/old, moved to the Recycle Bin.
    const allowed = new Map(this.bigDownloads().map((f) => [f.name, f]));
    for (const name of new Set(downloadNames)) {
      const f = allowed.get(name);
      if (!f || !this.d.trash) continue;
      try {
        await this.d.trash(join(this.d.env.downloads, name));
        freed += f.size;
      } catch {
        skipped++;
      }
    }
    return {
      freed,
      skipped,
      message: skipped
        ? `Some files were in use and were left alone (${skipped}). Close apps like browsers and try again for more.`
        : 'Done.',
    };
  }
}
