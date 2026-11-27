/** Automatic backup and recovery of Alton's own data: settings, notes and memories, routines,
 *  apps list, chats, shifts, habits, plugins and the mod tools' records.
 *  - Once a day into userData/backups/<date>; the last 7 days plus one a week for 4 weeks are
 *    kept, and a copy is made before every update and before a restore.
 *  - Each backup has a manifest saying which files were readable, so a damaged file is never
 *    treated as a good copy.
 *  - At start-up, a data file that can't be read (half-written, emptied) is put back from the
 *    newest backup where it's fine; the damaged one is kept beside it.
 *  Keys and passwords (*.bin) and paired phones are never copied: they only work on this PC. */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export const BACKUP_ITEMS = [
  'settings.json',
  'apps.json',
  'notes.json',
  'routines.json',
  'timers.json',
  'memory-learned.json',
  'habits.json',
  'shifts.json',
  'suggestions.json',
  'usage.json',
  'cpfix.json',
  'cpremoved.json',
  'cprec.json',
  'vortex-sync.json',
  'mcfix.json',
  'chats',
  'plugins',
];
const KEEP_DAILY = 7;
const KEEP_WEEKLY = 4;
const KEEP_EXTRA = 5;
const NAME = /^\d{4}-\d{2}-\d{2}(-[a-z0-9-]+)?$/;
const WEEK = 7 * 86_400_000;

export interface BackupInfo {
  name: string;
  at: number;
  /** Size in bytes. */
  size: number;
  /** Files that couldn't be read when the backup was made. */
  damaged?: string[];
}

interface Manifest {
  at: number;
  files: Record<string, { ok: boolean; size: number }>;
}

const dirSize = (p: string): number => {
  const st = statSync(p);
  if (!st.isDirectory()) return st.size;
  return readdirSync(p).reduce((n, f) => n + dirSize(join(p, f)), 0);
};

/** Is this JSON data file readable? (Missing counts as fine: nothing to check.) */
export function readableJson(path: string): boolean {
  try {
    const text = readFileSync(path, 'utf8');
    if (!text.trim()) return false;
    JSON.parse(text);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ENOENT';
  }
}

/** Which daily backups to keep: the newest `daily`, then the newest of each older week up to
 *  `weekly` weeks. Input newest first; returns the names to keep. */
export function keepPlan(
  backups: Array<{ name: string; at: number }>,
  daily = KEEP_DAILY,
  weekly = KEEP_WEEKLY,
): Set<string> {
  const keep = new Set(backups.slice(0, daily).map((b) => b.name));
  const weeks = new Set<number>();
  for (const b of backups.slice(daily)) {
    const w = Math.floor(b.at / WEEK);
    if (weeks.has(w)) continue;
    if (weeks.size >= weekly) break;
    weeks.add(w);
    keep.add(b.name);
  }
  return keep;
}

export class DataBackup {
  constructor(
    private readonly userData: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private get root(): string {
    return join(this.userData, 'backups');
  }

  private dateName(): string {
    const d = this.now();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private manifest(name: string): Manifest | null {
    try {
      return JSON.parse(readFileSync(join(this.root, name, 'manifest.json'), 'utf8')) as Manifest;
    } catch {
      return null;
    }
  }

  list(): BackupInfo[] {
    if (!existsSync(this.root)) return [];
    return readdirSync(this.root)
      .filter((n) => NAME.test(n))
      .map((name) => {
        const p = join(this.root, name);
        const m = this.manifest(name);
        const damaged = m
          ? Object.entries(m.files)
              .filter(([, f]) => !f.ok)
              .map(([n]) => n)
          : [];
        return {
          name,
          at: m?.at ?? statSync(p).mtimeMs,
          size: dirSize(p),
          ...(damaged.length ? { damaged } : {}),
        };
      })
      .sort((a, b) => b.at - a.at);
  }

  /** Back up now (named by date, or with a suffix like "before-restore"). */
  backup(suffix = ''): BackupInfo | null {
    const clean = suffix
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const name = clean ? `${this.dateName()}-${clean}` : this.dateName();
    const dest = join(this.root, name);
    const files: Manifest['files'] = {};
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    for (const item of BACKUP_ITEMS) {
      const src = join(this.userData, item);
      if (!existsSync(src)) continue;
      cpSync(src, join(dest, item), { recursive: true });
      const ok = !item.endsWith('.json') || readableJson(join(dest, item));
      files[item] = { ok, size: dirSize(join(dest, item)) };
    }
    if (!Object.keys(files).length) {
      rmSync(dest, { recursive: true, force: true });
      return null;
    }
    writeFileSync(
      join(dest, 'manifest.json'),
      JSON.stringify({ at: this.now().getTime(), files } satisfies Manifest),
    );
    this.prune();
    return this.list().find((b) => b.name === name) ?? null;
  }

  /** Daily backup if today's doesn't exist yet. */
  daily(): BackupInfo | null {
    if (existsSync(join(this.root, this.dateName()))) return null;
    return this.backup();
  }

  /** Put a backup's files back (the current data is backed up first). Restart afterwards.
   *  Files the backup recorded as damaged are left as they are now. */
  restore(name: string): boolean {
    if (!NAME.test(name)) return false;
    const src = join(this.root, name);
    if (!existsSync(src)) return false;
    const m = this.manifest(name);
    this.backup('before-restore');
    for (const item of BACKUP_ITEMS) {
      const from = join(src, item);
      if (!existsSync(from)) continue;
      if (m?.files[item]?.ok === false) continue;
      if (item.endsWith('.json') && !readableJson(from)) continue;
      const to = join(this.userData, item);
      rmSync(to, { recursive: true, force: true });
      cpSync(from, to, { recursive: true });
    }
    return true;
  }

  /** Start-up check: data files that can't be read are put back from the newest backup where
   *  they're fine (the damaged file is kept as "<name>.damaged-<time>"). Returns what was fixed. */
  recoverDamaged(): Array<{ file: string; from: string }> {
    const fixed: Array<{ file: string; from: string }> = [];
    const backups = this.list();
    for (const item of BACKUP_ITEMS) {
      if (!item.endsWith('.json')) continue;
      const path = join(this.userData, item);
      if (!existsSync(path) || readableJson(path)) continue;
      const good = backups.find(
        (b) =>
          existsSync(join(this.root, b.name, item)) && readableJson(join(this.root, b.name, item)),
      );
      if (!good) continue;
      try {
        renameSync(path, `${path}.damaged-${this.now().getTime()}`);
        cpSync(join(this.root, good.name, item), path);
        fixed.push({ file: item, from: good.name });
      } catch {
        /* leave it: the app's own defaults take over */
      }
    }
    return fixed;
  }

  private prune(): void {
    const all = this.list();
    const daily = all.filter((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.name));
    const keep = keepPlan(daily);
    for (const old of daily)
      if (!keep.has(old.name)) rmSync(join(this.root, old.name), { recursive: true, force: true });
    const extra = all.filter((b) => !/^\d{4}-\d{2}-\d{2}$/.test(b.name));
    for (const old of extra.slice(KEEP_EXTRA))
      rmSync(join(this.root, old.name), { recursive: true, force: true });
  }
}
