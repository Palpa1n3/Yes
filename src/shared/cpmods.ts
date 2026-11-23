/** Cyberpunk 2077 mods: what Vortex has installed (from its mod folder names), what Nexus Mods
 *  says is newest, and which ones have updates. Pure; tested in tests/cpmods.test.ts. */

export interface CpMod {
  /** Vortex's folder name (unique). */
  folder: string;
  name: string;
  /** Nexus Mods id (null = not from Nexus, or the name doesn't say). */
  modId: number | null;
  /** As installed ("1.2.1"), '' if unknown. */
  version: string;
  /** When the installed file was uploaded/downloaded (ms), 0 if unknown. */
  installedAt: number;
}

export interface NexusInfo {
  modId: number;
  name: string;
  version: string;
  /** Last time the mod's files changed (ms). */
  updatedAt: number;
  /** The newest main file, for Vortex to download. */
  fileId: number | null;
  /** Hidden, removed or not published: no updates to offer. */
  available: boolean;
  /** When Alton last asked Nexus (ms). */
  checkedAt: number;
}

export interface ModUpdate {
  mod: CpMod;
  latest: NexusInfo;
}

/** Old Vortex/Nexus names: "Name-12345-1-2-1-1698045803" (version with dashes, Unix time). */
const OLD = /^(.*?)-(\d{1,7})-(.+?)-(\d{9,11})$/;
/** Newer names: "Name 36600 1.0.0.0 2026-10-30T22-20Z AbCdEf". */
const NEW = /^(.*?) (\d{1,7}) (\S+) (\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})Z(?: \S+)?$/;

export function parseModFolder(folder: string): CpMod {
  const n = NEW.exec(folder);
  if (n) {
    const at = Date.UTC(
      Number(n[4]?.slice(0, 4)),
      Number(n[4]?.slice(5, 7)) - 1,
      Number(n[4]?.slice(8, 10)),
      Number(n[5]),
      Number(n[6]),
    );
    return {
      folder,
      name: (n[1] ?? folder).trim(),
      modId: Number(n[2]),
      version: n[3] ?? '',
      installedAt: Number.isFinite(at) ? at : 0,
    };
  }
  const o = OLD.exec(folder);
  if (o) {
    const v = o[3] ?? '';
    // "2024-06-10" style versions keep their dashes; "1-2-1" means 1.2.1.
    const version = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : v.replace(/-/g, '.');
    return {
      folder,
      name: (o[1] ?? folder).trim(),
      modId: Number(o[2]),
      version,
      installedAt: Number(o[4]) * 1000,
    };
  }
  return { folder, name: folder, modId: null, version: '', installedAt: 0 };
}

/** "v1.2.10" → [1, 2, 10]. Leading words are skipped ("cd 2.0.1") and the version stops at
 *  the first word after the numbers ("1.1.3 for 2.31" → 1.1.3). */
function parts(v: string): number[] {
  const out: number[] = [];
  for (const t of v
    .toLowerCase()
    .replace(/^v(er(sion)?)?\s*/, '')
    .split(/[.\-_ ]/)) {
    const n = parseInt(t, 10);
    if (Number.isFinite(n)) out.push(n);
    else if (out.length) break;
  }
  return out;
}

/** Vortex's own work folders and files in its mods folder, not mods. */
export const isVortexInternal = (folder: string): boolean =>
  /^__vortex|^collection_|\.(msgpack|json|txt)$/i.test(folder);

/** Is `latest` a newer version than `installed`? null = can't tell from the strings. */
export function versionNewer(installed: string, latest: string): boolean | null {
  const a = parts(installed);
  const b = parts(latest);
  if (!a.length || !b.length) return null;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (y !== x) return y > x;
  }
  return false;
}

/** An update is offered when Nexus has a newer version, or (when versions can't be compared)
 *  when its files changed more than a day after the installed one. */
export function hasUpdate(mod: CpMod, latest: NexusInfo): boolean {
  if (!latest.available) return false;
  const v = mod.version && latest.version ? versionNewer(mod.version, latest.version) : null;
  if (v !== null) return v;
  return mod.installedAt > 0 && latest.updatedAt > mod.installedAt + 86_400_000;
}

/** Mods with updates, newest change first. Several Vortex folders for the same mod (optional
 *  files) count once, by their newest install. */
export function findUpdates(mods: CpMod[], info: Map<number, NexusInfo>): ModUpdate[] {
  const best = new Map<number, CpMod>();
  for (const m of mods) {
    if (m.modId === null) continue;
    const b = best.get(m.modId);
    if (!b || m.installedAt > b.installedAt) best.set(m.modId, m);
  }
  const out: ModUpdate[] = [];
  for (const [id, mod] of best) {
    const latest = info.get(id);
    if (latest && hasUpdate(mod, latest)) out.push({ mod, latest });
  }
  return out.sort((a, b) => b.latest.updatedAt - a.latest.updatedAt);
}

/** Which mods need asking Nexus about: never asked, asked over a week ago, or listed by Nexus
 *  as changed since we last asked (`changed`: modId → last change, from updated.json). */
export function needsCheck(
  ids: number[],
  cache: Map<number, NexusInfo>,
  changed: Map<number, number>,
  now: number,
): number[] {
  return [...new Set(ids)].filter((id) => {
    const c = cache.get(id);
    if (!c) return true;
    if (now - c.checkedAt > 7 * 86_400_000) return true;
    const ch = changed.get(id);
    return ch !== undefined && ch > c.checkedAt;
  });
}

/** Find mods by words in their name ("cats", "ACU"). */
export function searchMods(mods: CpMod[], q: string): CpMod[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return mods;
  return mods.filter((m) => words.every((w) => m.name.toLowerCase().includes(w)));
}

export const nexusPage = (modId: number, files = false): string =>
  `https://www.nexusmods.com/cyberpunk2077/mods/${modId}${files ? '?tab=files' : ''}`;

/* ── Update progress ── */
export type UpdateState = 'queued' | 'sending' | 'in-vortex' | 'opened' | 'installed' | 'failed';

export interface UpdateJob {
  modId: number;
  name: string;
  state: UpdateState;
  /** When it last changed (ms). */
  at: number;
  error?: string;
  /** Vortex's folders for this mod before the update, to spot the new one. */
  before: string[];
}

/** Has Vortex installed a new copy of the mod since the job started (a folder it didn't have)? */
export function installedSince(job: Pick<UpdateJob, 'modId' | 'before'>, mods: CpMod[]): boolean {
  const before = new Set(job.before);
  return mods.some((m) => m.modId === job.modId && !before.has(m.folder));
}

/** Jobs waiting on Vortex become "installed" once their new folder shows up. */
export function settleJobs(jobs: UpdateJob[], mods: CpMod[], now: number): UpdateJob[] {
  return jobs.map((j) =>
    (j.state === 'in-vortex' || j.state === 'opened') && installedSince(j, mods)
      ? { ...j, state: 'installed', at: now }
      : j,
  );
}

/** "Sending 12 of 140" style counts. */
export function jobCounts(jobs: UpdateJob[]): Record<UpdateState, number> {
  const c: Record<UpdateState, number> = {
    queued: 0,
    sending: 0,
    'in-vortex': 0,
    opened: 0,
    installed: 0,
    failed: 0,
  };
  for (const j of jobs) c[j.state]++;
  return c;
}
