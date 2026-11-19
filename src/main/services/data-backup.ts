/** Automatic backup and recovery of Alton's own data (settings, notes and memories, routines,
 *  apps list, chats). Once a day into userData/backups/<date>; the last 7 are kept.
 *  Keys and passwords (*.bin) are never copied: they only work on this PC anyway. */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const BACKUP_ITEMS = [
  'settings.json',
  'apps.json',
  'notes.json',
  'routines.json',
  'timers.json',
  'memory-learned.json',
  'chats',
];
const KEEP = 7;

export interface BackupInfo {
  name: string;
  at: number;
  /** Size in bytes. */
  size: number;
}

const dirSize = (p: string): number => {
  const st = statSync(p);
  if (!st.isDirectory()) return st.size;
  return readdirSync(p).reduce((n, f) => n + dirSize(join(p, f)), 0);
};

export class DataBackup {
  constructor(
    private readonly userData: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private get root(): string {
    return join(this.userData, 'backups');
  }

  list(): BackupInfo[] {
    if (!existsSync(this.root)) return [];
    return readdirSync(this.root)
      .filter((n) => /^\d{4}-\d{2}-\d{2}(-[a-z0-9-]+)?$/.test(n))
      .map((name) => {
        const p = join(this.root, name);
        return { name, at: statSync(p).mtimeMs, size: dirSize(p) };
      })
      .sort((a, b) => b.at - a.at);
  }

  /** Back up now (named by date, or with a suffix like "before-restore"). */
  backup(suffix = ''): BackupInfo | null {
    const d = this.now();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const name = suffix ? `${date}-${suffix}` : date;
    const dest = join(this.root, name);
    let copied = 0;
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    for (const item of BACKUP_ITEMS) {
      const src = join(this.userData, item);
      if (!existsSync(src)) continue;
      cpSync(src, join(dest, item), { recursive: true });
      copied++;
    }
    if (!copied) {
      rmSync(dest, { recursive: true, force: true });
      return null;
    }
    this.prune();
    return this.list().find((b) => b.name === name) ?? null;
  }

  /** Daily backup if today's doesn't exist yet. */
  daily(): BackupInfo | null {
    const d = this.now();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (existsSync(join(this.root, today))) return null;
    return this.backup();
  }

  /** Put a backup's files back (the current data is backed up first). Restart afterwards. */
  restore(name: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}(-[a-z0-9-]+)?$/.test(name)) return false;
    const src = join(this.root, name);
    if (!existsSync(src)) return false;
    this.backup('before-restore');
    for (const item of BACKUP_ITEMS) {
      const from = join(src, item);
      if (!existsSync(from)) continue;
      const to = join(this.userData, item);
      rmSync(to, { recursive: true, force: true });
      cpSync(from, to, { recursive: true });
    }
    return true;
  }

  private prune(): void {
    const daily = this.list().filter((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.name));
    for (const old of daily.slice(KEEP))
      rmSync(join(this.root, old.name), { recursive: true, force: true });
    const extra = this.list().filter((b) => !/^\d{4}-\d{2}-\d{2}$/.test(b.name));
    for (const old of extra.slice(3))
      rmSync(join(this.root, old.name), { recursive: true, force: true });
  }
}
