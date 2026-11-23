/** Cyberpunk 2077 archive load order. Archives in archive\pc\mod load in name order (or in the
 *  order of archive\pc\mod\modlist.txt), and when two change the same game file the FIRST one
 *  loaded wins. This finds real clashes (from each archive's file index) and suggests moving
 *  patches and fixes ahead of the mods they patch. Pure; tested in tests/loadorder.test.ts. */

/** The game-file ids (FNV-1a 64 hashes, hex) an archive changes, from its index block. The
 *  index starts with: u32 table offset, u32 table size, u64 crc, u32 entries, u32 segments,
 *  u32 dependencies, then 56-byte entries whose first 8 bytes are the hash. */
export function archiveHashes(index: Uint8Array): string[] {
  if (index.length < 28) return [];
  const v = new DataView(index.buffer, index.byteOffset, index.byteLength);
  const count = v.getUint32(16, true);
  if (count > 500_000) return [];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const at = 28 + i * 56;
    if (at + 8 > index.length) break;
    out.push(v.getBigUint64(at, true).toString(16));
  }
  return out;
}

/** The archive header: where the index is and how big. null = not a valid archive. */
export function archiveHeader(head: Uint8Array): { indexPos: number; indexSize: number } | null {
  if (head.length < 20) return null;
  const v = new DataView(head.buffer, head.byteOffset, head.byteLength);
  if (String.fromCharCode(head[0] ?? 0, head[1] ?? 0, head[2] ?? 0, head[3] ?? 0) !== 'RDAR')
    return null;
  const indexPos = Number(v.getBigUint64(8, true));
  const indexSize = v.getUint32(16, true);
  if (!indexPos || indexSize < 28 || indexSize > 64_000_000) return null;
  return { indexPos, indexSize };
}

/** The game's own order: plain character order of the file names (! # 0-9 A-Z _ a-z). */
export const gameOrder = (names: string[]): string[] =>
  [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** Read archive\pc\mod\modlist.txt: archives listed load first, in that order; the rest follow
 *  in name order. */
export function effectiveOrder(names: string[], modlist: string | null): string[] {
  if (!modlist) return gameOrder(names);
  const have = new Set(names);
  const listed = modlist
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && have.has(l));
  const seen = new Set(listed);
  return [...new Set(listed), ...gameOrder(names.filter((n) => !seen.has(n)))];
}

export interface Conflict {
  /** Loads first, so its version of the shared files is used. */
  winner: string;
  loser: string;
  files: number;
}

/** Pairs of archives that change the same game files, in the given load order. */
export function findConflicts(order: string[], hashes: Map<string, string[]>): Conflict[] {
  const firstOwner = new Map<string, string>();
  const pairs = new Map<string, Conflict>();
  for (const name of order) {
    for (const h of new Set(hashes.get(name) ?? [])) {
      const owner = firstOwner.get(h);
      if (!owner) {
        firstOwner.set(h, name);
        continue;
      }
      const key = `${owner}\u0000${name}`;
      const c = pairs.get(key) ?? { winner: owner, loser: name, files: 0 };
      c.files++;
      pairs.set(key, c);
    }
  }
  return [...pairs.values()].sort((a, b) => b.files - a.files);
}

/** A patch, fix or add-on for another mod (should win over it). */
export const isPatch = (name: string): boolean =>
  /patch|fix|compat|addon|add-on|override|tweak|for[ _-]|hotfix|update/i.test(
    name.replace(/\.archive$/i, ''),
  );

const GENERIC = new Set(
  'patch fix fixes compat compatibility addon add override tweak tweaks hotfix update for the and with mod mods archive version main optional file files new better improved'.split(
    ' ',
  ),
);
const words = (name: string): Set<string> =>
  new Set(
    name
      .replace(/\.archive$/i, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !GENERIC.has(w)),
  );

/** Do two archive names share a real word ("Cats Patch" and "Apartment Cats")? */
export function related(a: string, b: string): boolean {
  const wa = words(a);
  for (const w of words(b)) if (wa.has(w)) return true;
  return false;
}

export interface Move {
  archive: string;
  /** Put it just before this one. */
  before: string;
  reason: string;
  /** Who the mod comes from (Vortex mod names), for showing. */
  files: number;
}

/** Where to move patches so they win their clashes; unchanged otherwise. */
export function suggestOrder(
  order: string[],
  conflicts: Conflict[],
): { order: string[]; moves: Move[] } {
  const next = [...order];
  const moves: Move[] = [];
  for (const c of conflicts) {
    // Only a patch for that mod (names share a word), never one for something else.
    if (!isPatch(c.loser) || isPatch(c.winner) || !related(c.loser, c.winner)) continue;
    const from = next.indexOf(c.loser);
    const to = next.indexOf(c.winner);
    if (from < 0 || to < 0 || from < to) continue;
    next.splice(from, 1);
    next.splice(next.indexOf(c.winner), 0, c.loser);
    moves.push({
      archive: c.loser,
      before: c.winner,
      files: c.files,
      reason: `It looks like a patch or fix, and it changes ${c.files} of the same file${c.files === 1 ? '' : 's'} as “${c.winner}”, which loads first and wins at the moment.`,
    });
  }
  return { order: next, moves };
}

/** modlist.txt for the suggested order. */
export const modlistText = (order: string[]): string =>
  `# Archive load order written by Alton (first loaded wins). Delete this file to go back to name order.\n${order.join('\n')}\n`;

/** Alternative versions of one mod ("…_Judy" and "…_Panam"): usually only one should be installed. */
export function variants(a: string, b: string): boolean {
  const base = (n: string): [string, string] => {
    const s = n.replace(/\.archive$/i, '');
    const i = Math.max(s.lastIndexOf('_'), s.lastIndexOf('-'));
    return i > 5
      ? [s.slice(0, i).toLowerCase(), s.slice(i + 1).toLowerCase()]
      : [s.toLowerCase(), ''];
  };
  const [ba, sa] = base(a);
  const [bb, sb] = base(b);
  return ba === bb && !!sa && !!sb && sa !== sb;
}

/** Make `archive` win over `over` (load just before it). */
export function preferOrder(order: string[], archive: string, over: string): string[] {
  const from = order.indexOf(archive);
  const to = order.indexOf(over);
  if (from < 0 || to < 0 || from < to) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(next.indexOf(over), 0, archive);
  return next;
}

/** Is this modlist.txt one Alton wrote (safe to remove on Undo)? */
export const isOurModlist = (text: string): boolean =>
  text.startsWith('# Archive load order written by Alton');
