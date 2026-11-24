/** Talking to Vortex through its own command line (Vortex.exe --get / --set, used only while
 *  Vortex is closed): escaping state paths, reading --get output, and working out file
 *  conflicts between enabled mods and which should win (patches, then the newer mod), as Vortex
 *  "after" rules. Pure; tested in tests/vortex.test.ts. */

/** A state path part with its dots escaped (Vortex splits paths on unescaped dots). */
export const escPath = (part: string): string => part.replace(/\\/g, '\\\\').replace(/\./g, '\\.');

/** `--get` prints "a.b.c = value" lines; values are JSON. */
export function parseGet(out: string): Map<string, unknown> {
  const m = new Map<string, unknown>();
  for (const line of out.split(/\r?\n/)) {
    const i = line.indexOf(' = ');
    if (i <= 0) continue;
    const raw = line.slice(i + 3).trim();
    let v: unknown = raw;
    try {
      v = JSON.parse(raw);
    } catch {
      /* plain text */
    }
    m.set(line.slice(0, i), v);
  }
  return m;
}

export interface VortexRule {
  type: string;
  reference: { id?: string; fileMD5?: string; logicalFileName?: string };
}

/** Is there already a rule between these two mods (either way)? */
export function hasRule(rulesA: VortexRule[], rulesB: VortexRule[], a: string, b: string): boolean {
  const refs = (rules: VortexRule[], other: string): boolean =>
    rules.some(
      (r) => ['before', 'after', 'conflicts'].includes(r.type) && r.reference?.id === other,
    );
  return refs(rulesA, b) || refs(rulesB, a);
}

export interface ConflictMod {
  id: string;
  name: string;
  /** Game-relative files it deploys. */
  files: string[];
  installedAt: number;
}

export interface FileConflict {
  /** Deploys after, so its files are used. */
  winner: string;
  loser: string;
  files: number;
  reason: string;
}

const PATCH = /patch|fix|compat|addon|add-on|tweak|override|hotfix|update/i;
/** A hotfix file name (a part that goes on top of a mod's main file). */
const HOTFIX_FILE = /hot ?fix|\bpatch\b/i;

/** Mods deploying the same files, with who should win: a patch/fix over the mod it patches,
 *  otherwise the more recently installed (usually the newer) version. */
export function fileConflicts(mods: ConflictMod[]): FileConflict[] {
  const owners = new Map<string, ConflictMod[]>();
  for (const m of mods)
    for (const f of m.files) {
      const k = f.replace(/\\/g, '/').toLowerCase();
      if (/(^|\/)__folder_managed_by_vortex$|\.(txt|md|jpg|png)$|^(readme|license)/i.test(k))
        continue;
      owners.set(k, [...(owners.get(k) ?? []), m]);
    }
  const pairs = new Map<string, FileConflict>();
  for (const list of owners.values()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i] as ConflictMod;
        const b = list[j] as ConflictMod;
        const pa = PATCH.test(a.name) && !PATCH.test(b.name);
        const pb = PATCH.test(b.name) && !PATCH.test(a.name);
        const [w, l, reason] = pa
          ? [a, b, `${a.name} is a patch/fix`]
          : pb
            ? [b, a, `${b.name} is a patch/fix`]
            : a.installedAt >= b.installedAt
              ? [a, b, `${a.name} is newer`]
              : [b, a, `${b.name} is newer`];
        const key = `${w.id}\u0000${l.id}`;
        const c = pairs.get(key) ?? { winner: w.id, loser: l.id, files: 0, reason };
        c.files++;
        pairs.set(key, c);
      }
  }
  return [...pairs.values()].sort((x, y) => y.files - x.files);
}

/** Two versions of the same Nexus mod both switched on and deploying the same files: the older
 *  copies should be switched off (a "which wins" rule would only hide the clash). */
export function olderDuplicates(
  mods: Array<ConflictMod & { nexusId: number | null }>,
): Array<{ id: string; name: string; newer: string }> {
  const byNexus = new Map<number, Array<ConflictMod & { nexusId: number | null }>>();
  for (const m of mods)
    if (m.nexusId !== null) byNexus.set(m.nexusId, [...(byNexus.get(m.nexusId) ?? []), m]);
  const out: Array<{ id: string; name: string; newer: string }> = [];
  for (const group of byNexus.values()) {
    if (group.length < 2) continue;
    // A hotfix/patch file of the same mod (newer, but only a few of its files) goes on top of
    // the main file: it's not a newer version of it. The newest full copy is the one to keep.
    const full = group.filter(
      (m) => !HOTFIX_FILE.test(m.name) || group.every((o) => o.files.length <= m.files.length),
    );
    const sorted = [...full].sort((a, b) => b.installedAt - a.installedAt);
    const newest = sorted[0];
    if (!newest) continue;
    const norm = (f: string): string => f.split('\\').join('/').toLowerCase();
    const newestFiles = new Set(newest.files.map(norm));
    for (const old of sorted.slice(1)) {
      // Much smaller than the copy it overlaps: a part of the mod, not an older version.
      if (newest.files.length * 2 < old.files.length && old.files.length > 3) continue;
      const overlap = old.files.some((f) => newestFiles.has(norm(f)));
      if (overlap) out.push({ id: old.id, name: old.name, newer: newest.id });
    }
  }
  return out;
}

export interface VortexEntry {
  id: string;
  archiveId: string;
  variant: string;
  /** Switched on in any Vortex profile. */
  enabled: boolean;
  installedAt: number;
}

/** Vortex's "Potential Duplicate Mods" warning: two entries made from the same download (same
 *  archive id and variant). The copies switched off everywhere can go; if none is on, the
 *  newest stays. */
export function sameDownloadCopies(entries: VortexEntry[]): string[] {
  const groups = new Map<string, VortexEntry[]>();
  for (const e of entries) {
    if (!e.archiveId) continue;
    const k = `${e.archiveId}\u0000${e.variant || 'default'}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const out: string[] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const keep = g.some((e) => e.enabled)
      ? new Set(g.filter((e) => e.enabled).map((e) => e.id))
      : new Set([[...g].sort((a, b) => b.installedAt - a.installedAt)[0]?.id]);
    for (const e of g) if (!keep.has(e.id)) out.push(e.id);
  }
  return out;
}

/** The last profile Vortex switched to, from its log ("switched to profile {"gameId":…,
 *  "current":…}"), with the log line's time. */
export function lastProfileSwitch(
  log: string,
): { gameId: string; profile: string; at: number } | null {
  let found: { gameId: string; profile: string; at: number } | null = null;
  for (const m of log.matchAll(
    /^(\S+) \[INFO\] \[RENDERER\] switched to profile \{"gameId":"([^"]+)","current":"([^"]+)"\}/gm,
  ))
    found = { at: Date.parse(m[1] ?? '') || 0, gameId: m[2] ?? '', profile: m[3] ?? '' };
  return found;
}
