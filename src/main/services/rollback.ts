/** Going back to the previous version when an update is broken.
 *  - BootGuard (userData/boot.json) watches each start: one that never gets to "running fine"
 *    (a minute after the window loads, or a clean quit) counts as failed; two in a row after an
 *    update and Alton rolls back by itself.
 *  - Rolling back: the previous version's installer comes from its GitHub release and is checked
 *    against the SHA-512 in that release's latest.yml; Alton's data goes back to the copy made
 *    just before the update; the broken version is never installed again automatically; then the
 *    old installer runs silently and starts Alton again. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dashed, newerVersion, onBoot, parseLatestYml, type BootRecord } from '@shared/rollback';
import { app } from 'electron';
import { DataBackup } from './data-backup';

export class BootGuard {
  private readonly file: string;

  constructor(userData: string) {
    this.file = join(userData, 'boot.json');
  }

  read(): BootRecord | null {
    try {
      const j = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<BootRecord>;
      if (typeof j.version !== 'string') return null;
      return {
        version: j.version,
        from: typeof j.from === 'string' ? j.from : null,
        fails: Number(j.fails) || 0,
        ok: j.ok === true,
        at: Number(j.at) || 0,
        skip: Array.isArray(j.skip) ? j.skip.filter((x): x is string => typeof x === 'string') : [],
        rollingBackFrom: typeof j.rollingBackFrom === 'string' ? j.rollingBackFrom : null,
        ...(typeof j.since === 'number' ? { since: j.since } : {}),
        ...(j.health && typeof j.health === 'object'
          ? {
              health: {
                at: Number(j.health.at) || 0,
                ok: j.health.ok === true,
                failed: Array.isArray(j.health.failed)
                  ? j.health.failed.filter((x): x is string => typeof x === 'string')
                  : [],
              },
            }
          : {}),
      };
    } catch {
      return null;
    }
  }

  private write(r: BootRecord): void {
    try {
      writeFileSync(this.file, JSON.stringify(r));
    } catch {
      /* not fatal */
    }
  }

  /** At start-up: record this start; returns the version to roll back to, if any. */
  start(current: string): string | null {
    const { rec, rollbackTo } = onBoot(this.read(), current, Date.now());
    this.write(rec);
    return rollbackTo;
  }

  /** This start got going properly (or quit cleanly). */
  markOk(): void {
    const r = this.read();
    if (r && !r.ok) this.write({ ...r, ok: true, fails: 0 });
  }

  /** Save this start's health check result. */
  recordHealth(ok: boolean, failed: string[]): void {
    const r = this.read();
    if (r) this.write({ ...r, health: { at: Date.now(), ok, failed: failed.slice(0, 10) } });
  }

  /** The version this one was updated from (to go back to), if known. */
  previous(): string | null {
    return this.read()?.from ?? null;
  }

  /** Versions never to install again automatically. */
  skipped(): string[] {
    return this.read()?.skip ?? [];
  }

  /** Rolling back from `version`: never install it again, and don't try twice. */
  markRollingBack(version: string): void {
    const r = this.read();
    if (!r) return;
    this.write({
      ...r,
      rollingBackFrom: version,
      skip: [...new Set([...r.skip, version])].slice(-20),
    });
  }

  /** A newer version than the skipped ones came out: they no longer matter. */
  clearSkipsBelow(version: string): void {
    const r = this.read();
    if (!r) return;
    const skip = r.skip.filter((v) => !newerVersion(version, v));
    if (skip.length !== r.skip.length) this.write({ ...r, skip });
  }
}

let guardOne: BootGuard | null = null;
/** The one BootGuard (userData/boot.json). */
export const bootGuard = (): BootGuard => (guardOne ??= new BootGuard(app.getPath('userData')));

/** The GitHub repo updates come from (electron-builder writes it next to the app). */
function updateRepo(): { owner: string; repo: string } {
  try {
    const y = readFileSync(join(process.resourcesPath, 'app-update.yml'), 'utf8');
    const owner = /^owner:\s*(\S+)/m.exec(y)?.[1];
    const repo = /^repo:\s*(\S+)/m.exec(y)?.[1];
    if (owner && repo) return { owner, repo };
  } catch {
    /* not packaged */
  }
  return { owner: 'Palpa1n3', repo: 'Yes' };
}

async function download(url: string, dest: string, sha512: string): Promise<void> {
  if (!/^https:\/\/github\.com\//.test(url)) throw new Error('not a GitHub download');
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`download failed (${res.status})`);
  const hash = createHash('sha512');
  const out = createWriteStream(`${dest}.part`);
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      if (!out.write(value)) await new Promise<void>((ok) => out.once('drain', () => ok()));
    }
    await new Promise<void>((ok, bad) => out.end((e?: Error | null) => (e ? bad(e) : ok())));
  } catch (e) {
    out.destroy();
    rmSync(`${dest}.part`, { force: true });
    throw e;
  }
  if (hash.digest('base64') !== sha512) {
    rmSync(`${dest}.part`, { force: true });
    throw new Error('the installer did not match its published checksum');
  }
  rmSync(dest, { force: true });
  renameSync(`${dest}.part`, dest);
}

/** Put `target` back in place of `current`: checked installer, data from before the update,
 *  `current` skipped from now on, then the old installer runs and Alton quits. */
export async function rollBack(o: {
  userData: string;
  guard: BootGuard;
  current: string;
  target: string;
  quit: () => void;
}): Promise<{ ok: boolean; message: string }> {
  try {
    if (!newerVersion(o.current, o.target))
      return { ok: false, message: `${o.target} isn’t older than ${o.current}.` };
    o.guard.markRollingBack(o.current);
    const { owner, repo } = updateRepo();
    const base = `https://github.com/${owner}/${repo}/releases/download/v${o.target}`;
    const ymlRes = await fetch(`${base}/latest.yml`, { signal: AbortSignal.timeout(30_000) });
    if (!ymlRes.ok) throw new Error(`version ${o.target} isn’t on GitHub any more`);
    const info = parseLatestYml(await ymlRes.text());
    if (!info) throw new Error('its release has no installer details');
    const dir = join(tmpdir(), 'ARC-rollback');
    mkdirSync(dir, { recursive: true });
    const exe = join(dir, info.path);
    if (!existsSync(exe)) await download(`${base}/${info.path}`, exe, info.sha512);
    // Alton's data as it was just before this update (today's data is backed up first).
    const backups = new DataBackup(o.userData);
    const before = backups
      .list()
      .find((b) => b.name.endsWith(`before-update-${dashed(o.current)}`));
    if (before) backups.restore(before.name);
    spawn(exe, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(o.quit, 1500);
    return {
      ok: true,
      message: `Going back to version ${o.target}${before ? ' and the data from just before the update' : ''}. Alton restarts in a moment.`,
    };
  } catch (e) {
    return {
      ok: false,
      message: `Couldn’t go back to ${o.target}: ${e instanceof Error ? e.message : 'error'}.`,
    };
  }
}
