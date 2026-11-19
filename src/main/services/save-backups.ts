/** Game-save backups: after a gaming session, files changed during it in the usual save
 *  folders are copied to userData/save-backups/<game>/<date-time>. The last 5 copies per game
 *  are kept. Copies only (the originals are never touched). */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const MAX_BYTES = 300 * 1024 * 1024;
const KEEP = 5;

/** Where Windows games usually keep saves. */
export function saveRoots(home: string, documents: string): string[] {
  return [
    join(home, 'Saved Games'),
    join(documents, 'My Games'),
    join(home, 'AppData', 'LocalLow'),
    join(home, 'AppData', 'Roaming', '.minecraft', 'saves'),
  ];
}

/** Files modified since `since` under the roots (skipping logs, caches and huge files). */
export function changedSaves(
  roots: string[],
  since: number,
): Array<{ root: string; file: string; size: number }> {
  const out: Array<{ root: string; file: string; size: number }> = [];
  const walk = (root: string, dir: string, depth: number): void => {
    if (depth > 6 || out.length > 2000) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!/^(cache|caches|logs?|crashes|shadercache|gpucache|unity|temp|tmp)$/i.test(e.name))
          walk(root, p, depth + 1);
        continue;
      }
      if (/\.(log|tmp|dmp|txt)$/i.test(e.name)) continue;
      try {
        const st = statSync(p);
        if (st.mtimeMs >= since && st.size < 100 * 1024 * 1024)
          out.push({ root, file: p, size: st.size });
      } catch {
        /* skip */
      }
    }
  };
  for (const r of roots) if (existsSync(r)) walk(r, r, 0);
  return out;
}

export function backupGameSaves(o: {
  game: string;
  since: number;
  roots: string[];
  dest: string;
  now?: Date;
}): { game: string; files: number; dir: string } | null {
  const files = changedSaves(o.roots, o.since);
  const total = files.reduce((n, f) => n + f.size, 0);
  if (!files.length || total > MAX_BYTES) return null;
  const safeGame = o.game.replace(/[<>:"/\\|?*]/g, '_').slice(0, 60) || 'Game';
  const d = o.now ?? new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
  const dir = join(o.dest, safeGame, stamp);
  let n = 0;
  for (const f of files) {
    const to = join(dir, relative(dirname(f.root), f.file));
    try {
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(f.file, to);
      n++;
    } catch {
      /* in use: skip */
    }
  }
  // Keep the newest few per game.
  const gameDir = join(o.dest, safeGame);
  const all = readdirSync(gameDir).sort().reverse();
  for (const old of all.slice(KEEP)) rmSync(join(gameDir, old), { recursive: true, force: true });
  return n ? { game: o.game, files: n, dir } : null;
}
