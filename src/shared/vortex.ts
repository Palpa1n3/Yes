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
