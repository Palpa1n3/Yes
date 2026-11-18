/** Storage helpers: recent downloads and on-demand folder sizes (time-boxed). */
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { DownloadItem, FolderSize } from '@shared/types';

export async function recentDownloads(dir: string, limit = 8): Promise<DownloadItem[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter(
          (e) =>
            e.isFile() &&
            !e.name.startsWith('.') &&
            !/\.(crdownload|part|tmp)$/i.test(e.name) &&
            e.name !== 'desktop.ini',
        )
        .map(async (e) => {
          const s = await stat(join(dir, e.name)).catch(() => null);
          return s ? { name: e.name, size: s.size, modified: s.mtimeMs } : null;
        }),
    );
    return files
      .filter((f): f is DownloadItem => f !== null)
      .sort((a, b) => b.modified - a.modified)
      .slice(0, limit);
  } catch {
    return [];
  }
}

interface WalkOptions {
  /** Stop after this long and report a lower bound. */
  budgetMs: number;
  /** Also total files older than this (ms since epoch). */
  olderThan?: number;
}

/** Sum file sizes under `root`. Skips symlinks; never throws; marks partial results. */
export async function folderSize(
  root: string,
  opts: WalkOptions,
): Promise<Omit<FolderSize, 'id' | 'name'>> {
  const deadline = Date.now() + opts.budgetMs;
  let bytes = 0;
  let files = 0;
  let oldBytes = 0;
  let complete = true;
  const stack = [root];
  while (stack.length) {
    if (Date.now() > deadline) {
      complete = false;
      break;
    }
    const dir = stack.pop() as string;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue; // permission denied etc.
    }
    // Stat files in modest batches to keep the main process responsive.
    for (let i = 0; i < entries.length; i += 64) {
      await Promise.all(
        entries.slice(i, i + 64).map(async (e) => {
          const p = join(dir, e.name);
          if (e.isSymbolicLink()) return;
          if (e.isDirectory()) return void stack.push(p);
          if (!e.isFile()) return;
          const s = await stat(p).catch(() => null);
          if (!s) return;
          bytes += s.size;
          files++;
          if (opts.olderThan && s.mtimeMs < opts.olderThan) oldBytes += s.size;
        }),
      );
    }
  }
  return { path: root, bytes, files, complete, oldBytes: opts.olderThan ? oldBytes : undefined };
}
