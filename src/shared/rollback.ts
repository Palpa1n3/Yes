/** Rolling back a broken update: watching the first starts of a new version, and the facts needed
 *  to put the previous one back. Pure; tested in tests/rollback.test.ts. */

/** userData/boot.json: how the last starts went. */
export interface BootRecord {
  /** The version that last started. */
  version: string;
  /** The version it was updated from (null: fresh install, or not known). */
  from: string | null;
  /** Starts of this version in a row that never got as far as "running fine". */
  fails: number;
  /** The last start got as far as "running fine" (or quit cleanly). */
  ok: boolean;
  at: number;
  /** Versions rolled back from: never installed again automatically. */
  skip: string[];
  /** Set while rolling back, so it's tried once per broken version. */
  rollingBackFrom?: string | null;
}

/** Is version `a` newer than `b` (x.y.z)? */
export function newerVersion(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** How many failed starts of a new version before it's rolled back. */
export const FAILS_BEFORE_ROLLBACK = 2;

/** A start: update the record and say whether to roll back (to which version). A start that
 *  never reached "running fine" counts as a failure when the next one begins. */
export function onBoot(
  rec: BootRecord | null,
  current: string,
  now: number,
): { rec: BootRecord; rollbackTo: string | null } {
  if (!rec)
    return {
      rec: { version: current, from: null, fails: 0, ok: false, at: now, skip: [] },
      rollbackTo: null,
    };
  if (rec.version !== current) {
    // Updated (or rolled back): remember where from, only when it's an upgrade.
    const from = newerVersion(current, rec.version) ? rec.version : (rec.from ?? null);
    return {
      rec: {
        version: current,
        from: newerVersion(current, rec.version) ? from : null,
        fails: 0,
        ok: false,
        at: now,
        skip: rec.skip,
        rollingBackFrom: null,
      },
      rollbackTo: null,
    };
  }
  const fails = rec.ok ? 0 : rec.fails + 1;
  const next: BootRecord = { ...rec, fails, ok: false, at: now };
  const rollbackTo =
    fails >= FAILS_BEFORE_ROLLBACK &&
    !!rec.from &&
    newerVersion(current, rec.from) &&
    rec.rollingBackFrom !== current
      ? rec.from
      : null;
  return { rec: next, rollbackTo };
}

/** electron-builder's latest.yml: the installer's file name and its SHA-512 (base64). */
export function parseLatestYml(
  text: string,
): { path: string; sha512: string; version: string } | null {
  const path = /^path:\s*(\S+)\s*$/m.exec(text)?.[1] ?? '';
  const sha512 = /^sha512:\s*(\S+)\s*$/m.exec(text)?.[1] ?? '';
  const version = /^version:\s*(\S+)\s*$/m.exec(text)?.[1] ?? '';
  if (!/^[\w.-]+\.exe$/i.test(path) || !/^[A-Za-z0-9+/=]{80,}$/.test(sha512)) return null;
  return { path, sha512, version };
}

/** A version as it appears in backup names ("0.81.0" → "0-81-0"). */
export const dashed = (v: string): string => v.replace(/[^0-9a-z]+/gi, '-');
