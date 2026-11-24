/** Minecraft mods (Lunar Client and .minecraft, Fabric): what each mod jar says about itself
 *  (fabric.mod.json), Fabric version ranges, and the problems that stop a modded game: mods for
 *  another Minecraft version, missing required mods, the same mod twice, mods that break each
 *  other, and what crash reports and the loader blame. Pure; tested in tests/mcmods.test.ts. */

export interface McMod {
  /** File name in the mods folder ("Chunky-Fabric-1.5.66.jar"); ".disabled" = switched off. */
  file: string;
  enabled: boolean;
  id: string;
  name: string;
  version: string;
  /** Mod id → version range(s) it needs. */
  depends: Record<string, string[]>;
  breaks: Record<string, string[]>;
  /** Other ids this jar also counts as (provides, and mods bundled inside it). */
  provides: string[];
  /** In Lunar's "dependencies" folder (installed for other mods). */
  library: boolean;
}

/** fabric.mod.json → the parts we need (null if it isn't a Fabric mod). */
export function parseFabricMod(
  text: string,
): (Omit<McMod, 'file' | 'enabled' | 'library'> & { jars: string[] }) | null {
  let j: Record<string, unknown>;
  try {
    // Some mods put raw newlines inside strings; JSON.parse tolerates neither, so flatten them.
    j = JSON.parse(text.replace(/\r?\n/g, ' ')) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof j.id !== 'string' || !j.id) return null;
  const ranges = (v: unknown): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    if (v && typeof v === 'object' && !Array.isArray(v))
      for (const [k, r] of Object.entries(v as Record<string, unknown>))
        out[k] = Array.isArray(r) ? r.map(String) : [String(r ?? '*')];
    return out;
  };
  const jars = Array.isArray(j.jars)
    ? (j.jars as Array<{ file?: unknown }>).map((x) => String(x?.file ?? '')).filter(Boolean)
    : [];
  return {
    id: j.id,
    name: typeof j.name === 'string' && j.name ? j.name : j.id,
    version: typeof j.version === 'string' ? j.version : '',
    depends: ranges(j.depends),
    breaks: ranges(j.breaks),
    provides: Array.isArray(j.provides) ? (j.provides as unknown[]).map(String) : [],
    jars,
  };
}

/* ── Fabric version ranges ("*", "1.21.x", ">=1.21 <1.22", "~1.21.1", "^0.4", arrays = OR) ── */
const nums = (v: string): number[] =>
  (v.replace(/^v/i, '').split(/[+-]/)[0] ?? '')
    .split('.')
    .map((p) => (/^x|\*$/i.test(p) ? NaN : parseInt(p, 10)));
function cmp(a: string, b: string): number {
  const x = nums(a);
  const y = nums(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = x[i] ?? 0;
    const q = y[i] ?? 0;
    if (Number.isNaN(p) || Number.isNaN(q)) return 0;
    if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}
function one(pred: string, version: string): boolean {
  const p = pred.trim();
  if (!p || p === '*') return true;
  const m = /^(>=|<=|>|<|=|~|\^)?\s*(.+)$/.exec(p);
  const op = m?.[1] ?? '';
  const v = (m?.[2] ?? p).trim();
  if (/[x*]/i.test(v) && !op) {
    const parts = v.split('.');
    const have = (version.split(/[+-]/)[0] ?? '').split('.');
    return parts.every((q, i) => /^[x*]$/i.test(q) || q === (have[i] ?? '0'));
  }
  const c = cmp(version, v);
  if (op === '>=') return c >= 0;
  if (op === '<=') return c <= 0;
  if (op === '>') return c > 0;
  if (op === '<') return c < 0;
  if (op === '~') {
    const [a, b] = nums(v);
    const [x, y] = nums(version);
    return c >= 0 && x === a && y === (b ?? 0);
  }
  if (op === '^') {
    const [a] = nums(v);
    return c >= 0 && nums(version)[0] === a;
  }
  return c === 0;
}
/** Does `version` satisfy any of the ranges (each range = space-separated conditions)? */
export function versionMatches(ranges: string[], version: string): boolean {
  if (!version) return true;
  return ranges.some((r) =>
    r
      .split(/\s+/)
      .filter(Boolean)
      .every((p) => one(p, version)),
  );
}

/* ── Problems ── */
export type McProblemKind = 'wrong-version' | 'missing' | 'duplicate' | 'breaks' | 'crash' | 'log';

export interface McProblem {
  kind: McProblemKind;
  /** The mod file it's about (the one to update / switch off). */
  file: string;
  modId: string;
  text: string;
  /** For "missing": the id of the mod that's needed. */
  needs?: string;
}

/** Ids the game or launcher provides itself (never "missing"). */
const PLATFORM =
  /^(minecraft|java|fabricloader|fabric-loader|fabric|ichor.*|lunar.*|quilt_loader|mixinextras)$/i;

export function findProblems(mods: McMod[], gameVersion: string): McProblem[] {
  const on = mods.filter((m) => m.enabled);
  const have = new Map<string, McMod>();
  for (const m of on) {
    have.set(m.id, m);
    for (const p of m.provides) if (!have.has(p)) have.set(p, m);
  }
  const out: McProblem[] = [];
  for (const m of on.filter((x) => !x.library)) {
    const mc = m.depends.minecraft;
    if (mc && gameVersion && !versionMatches(mc, gameVersion))
      out.push({
        kind: 'wrong-version',
        file: m.file,
        modId: m.id,
        text: `${m.name} ${m.version} is made for Minecraft ${mc.join(' or ')}, not ${gameVersion}.`,
      });
    for (const [dep, r] of Object.entries(m.depends)) {
      if (PLATFORM.test(dep)) continue;
      const got = have.get(dep);
      if (!got)
        out.push({
          kind: 'missing',
          file: m.file,
          modId: m.id,
          needs: dep,
          text: `${m.name} needs “${dep}”${r.some((x) => x !== '*') ? ` (${r.join(' or ')})` : ''}, which isn’t installed.`,
        });
    }
    for (const [bad, r] of Object.entries(m.breaks)) {
      const got = have.get(bad);
      if (got && got !== m && versionMatches(r, got.version))
        out.push({
          kind: 'breaks',
          file: got.file,
          modId: got.id,
          text: `${m.name} says it doesn’t work with ${got.name} ${got.version}.`,
        });
    }
  }
  // The same mod twice: keep the newest, flag the rest.
  const byId = new Map<string, McMod[]>();
  // Only the user's own mods: library copies (Lunar's dependencies folder) are sorted out by the
  // loader itself, which picks the newest.
  for (const m of on.filter((x) => !x.library)) byId.set(m.id, [...(byId.get(m.id) ?? []), m]);
  for (const list of byId.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => cmp(b.version, a.version));
    for (const old of sorted.slice(1))
      out.push({
        kind: 'duplicate',
        file: old.file,
        modId: old.id,
        text: `${old.name} is installed twice (${sorted.map((x) => x.version).join(' and ')}); ${old.version} is the older copy.`,
      });
  }
  return out;
}

/** "Suspected Mods" / "Suspected Mod" lines from a Minecraft crash report, plus its description. */
export function parseCrashReport(text: string): { description: string; suspects: string[] } {
  const description = /^Description:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? '';
  const suspects = new Set<string>();
  const block = /Suspected Mods?:\s*([\s\S]*?)(?:\n\s*\n|\nStacktrace:|$)/i.exec(text)?.[1] ?? '';
  for (const l of block.split(/\r?\n/)) {
    const m = /^\s*([^(\n]+?)\s*\(([\w.-]+)\)/.exec(l);
    if (m?.[2] && !/^(minecraft|java|fabricloader)$/i.test(m[2])) suspects.add(m[2]);
  }
  return { description, suspects: [...suspects] };
}

/** What Fabric Loader and mods complained about in the game log (incompatible mods, errors). */
export function logProblems(log: string): string[] {
  const out: string[] = [];
  const incompat = /Incompatible mods? (?:set|found)!?([\s\S]*?)(?:\n\[|\n\s*\n|$)/i.exec(log)?.[1];
  if (incompat)
    for (const l of incompat.split(/\r?\n/))
      if (l.trim().replace(/^[-*\s]+/, '').length > 8) out.push(l.trim().replace(/^[-*\s]+/, ''));
  for (const l of log.split(/\r?\n/)) {
    if (
      /Partially Incompatible|is incompatible with|requires .* which is missing|Mod resolution failed/i.test(
        l,
      )
    )
      out.push(l.replace(/^\[[^\]]*\]\s*(\[[^\]]*\]:?\s*)*/, '').trim());
  }
  return [...new Set(out)].slice(0, 20);
}

/** The Modrinth project that provides a mod id ("fabric-lifecycle-events-v1" → "fabric-api"). */
export function modrinthProjectFor(id: string): string {
  if (
    /^fabric-.*-v\d+$/i.test(id) ||
    /^fabric-(api-base|api|renderer-indigo|convention-tags.*)$/i.test(id)
  )
    return 'fabric-api';
  if (/^libjf(-|$)/i.test(id)) return 'libjf';
  if (/^(c2me|cloth-basic-math)/i.test(id)) return id.startsWith('c2me') ? 'c2me-fabric' : id;
  return id;
}
