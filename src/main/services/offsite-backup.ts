/** Encrypted backups to a separate place (safety gate 5): another drive, a USB stick or a synced
 *  folder the user chooses. Optional (Settings › Privacy › Backups).
 *  - The same files as the daily backups (services/data-backup.ts BACKUP_ITEMS: settings, notes,
 *    memories, routines, chats…); keys and passwords (*.bin) are never included.
 *  - One file per day, `alton-YYYY-MM-DD.altonbak`: the files bundled, gzipped, then encrypted with
 *    AES-256-GCM (tamper-evident). The key is random, kept in userData encrypted by Windows
 *    (only this PC's Windows account can unlock it).
 *  - A recovery code, shown once when backups are first set up, unlocks the key on another PC
 *    (the backup folder holds the key wrapped with the code via scrypt; never the code itself).
 *  - Every copy is read back, decrypted and hash-checked after writing; the last 8 are kept.
 *  - Restoring checks every file's hash first, backs up the current data, then puts files back. */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, parse, relative, resolve, sep } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { OffsiteCopy, OffsiteResult } from '@shared/ipc';
import { BACKUP_ITEMS } from './data-backup';

const MAGIC = Buffer.from('ALTB1');
export const KEEP_COPIES = 8;
const FILE = /^alton-(\d{4}-\d{2}-\d{2})\.altonbak$/;
const KEY_FILE = 'alton-backup-key.json';
const SUB = 'Alton backups';

/** Where the key lives (encrypted by Windows); injectable for tests. */
export interface KeyStore {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
}

/* ── Encryption ─────────────────────────────────────────────────────────── */

export function seal(key: Buffer, plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}

/** Decrypts, or throws if the key is wrong or the file was changed. */
export function open(key: Buffer, blob: Buffer): Buffer {
  if (blob.length < MAGIC.length + 28 || !blob.subarray(0, MAGIC.length).equals(MAGIC))
    throw new Error('Not an Alton backup file.');
  const iv = blob.subarray(5, 17);
  const tag = blob.subarray(17, 33);
  const d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  try {
    return Buffer.concat([d.update(blob.subarray(33)), d.final()]);
  } catch {
    throw new Error("The backup couldn't be unlocked: wrong key or code, or the file was changed.");
  }
}

/** A recovery code people can write down: 6 groups of 4, no look-alike characters. */
export function newRecoveryCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = randomBytes(24);
  const chars = [...b].map((x) => A[x % A.length]);
  return Array.from({ length: 6 }, (_, i) => chars.slice(i * 4, i * 4 + 4).join('')).join('-');
}

const normCode = (code: string): string => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** The key wrapped with the recovery code (stored beside the backups). */
export function wrapKey(key: Buffer, code: string): string {
  const salt = randomBytes(16);
  const kek = scryptSync(normCode(code), salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 << 20 });
  return JSON.stringify({
    v: 1,
    salt: salt.toString('base64'),
    key: seal(kek, key).toString('base64'),
  });
}

export function unwrapKey(wrapped: string, code: string): Buffer {
  const j = JSON.parse(wrapped) as { salt: string; key: string };
  const kek = scryptSync(normCode(code), Buffer.from(j.salt, 'base64'), 32, {
    N: 1 << 15,
    r: 8,
    p: 1,
    maxmem: 64 << 20,
  });
  return open(kek, Buffer.from(j.key, 'base64'));
}

/* ── Bundling ───────────────────────────────────────────────────────────── */

interface Entry {
  path: string;
  size: number;
  sha256: string;
}

const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

/** userData's backup items → one gzipped bundle (a JSON header, then the files' bytes). */
export function bundle(userData: string, at: number): Buffer {
  const entries: Entry[] = [];
  const bodies: Buffer[] = [];
  const add = (abs: string): void => {
    const data = readFileSync(abs);
    entries.push({
      path: relative(userData, abs).split(sep).join('/'),
      size: data.length,
      sha256: sha(data),
    });
    bodies.push(data);
  };
  const walk = (abs: string): void => {
    const st = statSync(abs);
    if (st.isDirectory()) for (const n of readdirSync(abs)) walk(join(abs, n));
    else if (st.isFile() && !abs.endsWith('.bin') && !abs.endsWith('.tmp')) add(abs);
  };
  for (const item of BACKUP_ITEMS) {
    const p = join(userData, item);
    if (existsSync(p)) walk(p);
  }
  const header = Buffer.from(JSON.stringify({ v: 1, at, files: entries }), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(header.length);
  return gzipSync(Buffer.concat([len, header, ...bodies]));
}

/** A bundle → its files, each checked against its hash (throws on any mismatch). */
export function unbundle(z: Buffer): { at: number; files: Array<{ path: string; data: Buffer }> } {
  const raw = gunzipSync(z);
  const n = raw.readUInt32BE(0);
  const h = JSON.parse(raw.subarray(4, 4 + n).toString('utf8')) as { at: number; files: Entry[] };
  let off = 4 + n;
  const files = h.files.map((e) => {
    const data = raw.subarray(off, off + e.size);
    off += e.size;
    if (data.length !== e.size || sha(data) !== e.sha256)
      throw new Error(`The backup is damaged (${e.path} doesn't match).`);
    // Only paths inside userData's backup items.
    const top = e.path.split('/')[0] ?? '';
    if (e.path.includes('..') || !BACKUP_ITEMS.includes(top) || e.path.endsWith('.bin'))
      throw new Error(`The backup has an unexpected file (${e.path}).`);
    return { path: e.path, data: Buffer.from(data) };
  });
  return { at: h.at, files };
}

/* ── The service ────────────────────────────────────────────────────────── */

/** Is `folder` on the same drive as `other`? (Then it doesn't protect against a dead drive.) */
export function sameDrive(folder: string, other: string): boolean {
  return parse(resolve(folder)).root.toLowerCase() === parse(resolve(other)).root.toLowerCase();
}

export function insideFolder(child: string, parent: string): boolean {
  const r = relative(resolve(parent), resolve(child));
  return !r || (!r.startsWith('..') && !r.includes(`..${sep}`) && !parse(r).root);
}

export class OffsiteBackup {
  constructor(
    private readonly d: {
      userData: string;
      folder(): string;
      keys: KeyStore;
      now?: () => Date;
      /** Before a restore: a normal backup of the current data. */
      backupCurrent?(): void;
    },
  ) {}

  private now(): Date {
    return this.d.now?.() ?? new Date();
  }

  private dir(): string {
    return join(this.d.folder(), SUB);
  }

  private day(): string {
    const t = this.now();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }

  /** Why this folder can't be used, or null. */
  folderProblem(folder = this.d.folder()): string | null {
    if (!folder) return 'No folder chosen.';
    if (insideFolder(folder, this.d.userData))
      return "That's inside Alton's own data folder: choose somewhere separate, ideally another drive.";
    return null;
  }

  list(): OffsiteCopy[] {
    const dir = this.dir();
    if (!this.d.folder() || !existsSync(dir)) return [];
    return readdirSync(dir)
      .map((f) => ({ f, m: FILE.exec(f) }))
      .filter((x): x is { f: string; m: RegExpExecArray } => !!x.m)
      .map(({ f, m }) => ({ file: f, day: m[1] ?? '', size: statSync(join(dir, f)).size }))
      .sort((a, b) => b.day.localeCompare(a.day));
  }

  private async key(): Promise<{ key: Buffer; recoveryCode?: string }> {
    const saved = await this.d.keys.get();
    const dir = this.dir();
    if (saved) {
      const key = Buffer.from(saved, 'base64');
      if (key.length === 32) {
        // A new folder: put the wrapped key there too (the code itself is never stored).
        return { key };
      }
    }
    const key = randomBytes(32);
    const recoveryCode = newRecoveryCode();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, KEY_FILE), wrapKey(key, recoveryCode));
    await this.d.keys.set(key.toString('base64'));
    return { key, recoveryCode };
  }

  /** Back up today (replacing today's copy), check it, and keep the last few. */
  async run(): Promise<OffsiteResult> {
    const problem = this.folderProblem();
    if (problem) return { ok: false, message: problem };
    try {
      const dir = this.dir();
      mkdirSync(dir, { recursive: true });
      const { key, recoveryCode } = await this.key();
      if (!existsSync(join(dir, KEY_FILE)) && !recoveryCode)
        return {
          ok: false,
          message:
            'This folder has no recovery key file yet. Choose "New recovery code" to set it up here.',
        };
      const plain = bundle(this.d.userData, this.now().getTime());
      const blob = seal(key, plain);
      const name = `alton-${this.day()}.altonbak`;
      const tmp = join(dir, `${name}.tmp`);
      writeFileSync(tmp, blob);
      // Check it: read back, unlock, every file's hash.
      const back = readFileSync(tmp);
      const files = unbundle(open(key, back)).files.length;
      renameSync(tmp, join(dir, name));
      for (const old of this.list().slice(KEEP_COPIES))
        rmSync(join(dir, old.file), { force: true });
      const copy = this.list().find((c) => c.file === name);
      return {
        ok: true,
        message: `Encrypted backup saved and checked (${files} files).`,
        ...(copy ? { copy } : {}),
        ...(recoveryCode ? { recoveryCode } : {}),
      };
    } catch (err) {
      return {
        ok: false,
        message: `Encrypted backup failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /** Start again with a new key and recovery code (old copies stay readable with the old code). */
  async newCode(): Promise<OffsiteResult> {
    const problem = this.folderProblem();
    if (problem) return { ok: false, message: problem };
    const key = randomBytes(32);
    const recoveryCode = newRecoveryCode();
    mkdirSync(this.dir(), { recursive: true });
    writeFileSync(join(this.dir(), KEY_FILE), wrapKey(key, recoveryCode));
    await this.d.keys.set(key.toString('base64'));
    const r = await this.run();
    return { ...r, recoveryCode };
  }

  /** Check a copy and put its files back (current data backed up first). With `code`, the
   *  recovery code unlocks it (e.g. on a new PC); otherwise this PC's key does. */
  async restore(file: string, code?: string): Promise<OffsiteResult> {
    if (!FILE.test(file)) return { ok: false, message: 'Not an Alton backup file.' };
    try {
      const blob = readFileSync(join(this.dir(), file));
      let key: Buffer | null = null;
      if (code?.trim()) key = unwrapKey(readFileSync(join(this.dir(), KEY_FILE), 'utf8'), code);
      else {
        const saved = await this.d.keys.get();
        key = saved ? Buffer.from(saved, 'base64') : null;
      }
      if (!key) return { ok: false, message: 'Enter the recovery code to unlock this backup.' };
      // Everything is checked before anything is changed.
      const { files } = unbundle(open(key, blob));
      this.d.backupCurrent?.();
      for (const f of files) {
        const to = join(this.d.userData, ...f.path.split('/'));
        mkdirSync(dirname(to), { recursive: true });
        writeFileSync(`${to}.tmp`, f.data);
        renameSync(`${to}.tmp`, to);
      }
      // A recovered key becomes this PC's key, so later backups carry on.
      if (code?.trim()) await this.d.keys.set(key.toString('base64'));
      return { ok: true, message: `Restored ${files.length} files from ${file}.` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }
}
