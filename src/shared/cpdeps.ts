/** Cyberpunk mod dependencies: what each installed mod needs (Nexus Mods' own "Requirements"
 *  list, the one Vortex's health check reads) and which of those aren't installed. Pure;
 *  tested in tests/cpdeps.test.ts. */

/** Cyberpunk 2077's numeric game id on Nexus Mods. */
export const NEXUS_GAME_ID = '3333';

export interface ModRequirements {
  modId: number;
  name: string;
  requires: Array<{ modId: string; gameId: string; modName: string; externalRequirement: boolean }>;
}

export interface MissingDep {
  modId: number;
  name: string;
  /** Installed mods that list it as a requirement. */
  neededBy: string[];
  /** Alton saved (took out) this mod earlier: put it back rather than download it. */
  saved: boolean;
}

/** Requirements of the installed mods that aren't installed themselves. Requirements on other
 *  sites (external) or for another game are left out; mods Alton saved count as not installed,
 *  and mods that are themselves saved don't need anything. */
export function missingDeps(
  installed: ReadonlySet<number>,
  saved: ReadonlySet<number>,
  reqs: ModRequirements[],
): MissingDep[] {
  const out = new Map<number, MissingDep>();
  for (const m of reqs) {
    if (saved.has(m.modId) || !installed.has(m.modId)) continue;
    for (const r of m.requires) {
      if (r.externalRequirement || r.gameId !== NEXUS_GAME_ID) continue;
      const id = Number(r.modId);
      if (!Number.isInteger(id) || id <= 0 || id === m.modId) continue;
      if (installed.has(id) && !saved.has(id)) continue;
      const d = out.get(id) ?? {
        modId: id,
        name: r.modName || `mod ${id}`,
        neededBy: [],
        saved: saved.has(id),
      };
      if (!d.neededBy.includes(m.name)) d.neededBy.push(m.name);
      out.set(id, d);
    }
  }
  return [...out.values()].sort(
    (a, b) => b.neededBy.length - a.neededBy.length || a.name.localeCompare(b.name),
  );
}

/** The Nexus GraphQL query for requirements (no API key needed). */
export const REQUIREMENTS_QUERY =
  'query($ids:[CompositeDomainWithIdInput!]!){legacyModsByDomain(ids:$ids){nodes{modId name modRequirements{nexusRequirements{nodes{modId gameId modName externalRequirement}}}}}}';

/** Read the GraphQL answer into ModRequirements. */
export function parseRequirements(json: unknown): ModRequirements[] {
  const nodes = (json as { data?: { legacyModsByDomain?: { nodes?: unknown[] } } } | null)?.data
    ?.legacyModsByDomain?.nodes;
  if (!Array.isArray(nodes)) return [];
  const out: ModRequirements[] = [];
  for (const n of nodes as Array<Record<string, unknown>>) {
    const modId = Number(n.modId);
    if (!Number.isInteger(modId)) continue;
    const reqNodes = (
      n.modRequirements as { nexusRequirements?: { nodes?: unknown[] } } | null | undefined
    )?.nexusRequirements?.nodes;
    out.push({
      modId,
      name: typeof n.name === 'string' ? n.name : `mod ${modId}`,
      requires: (Array.isArray(reqNodes) ? (reqNodes as Array<Record<string, unknown>>) : []).map(
        (r) => ({
          modId: String(r.modId ?? ''),
          gameId: String(r.gameId ?? ''),
          modName: typeof r.modName === 'string' ? r.modName : '',
          externalRequirement: r.externalRequirement === true,
        }),
      ),
    });
  }
  return out;
}

export interface NexusFile {
  id: number;
  name: string;
  category: string;
  primary: boolean;
  at: number;
}

const HOTFIX = /hot ?fix|patch|fix\b|crash/i;

/** Which files make up the mod: the primary main file (else the newest main file that isn't a
 *  hotfix, else the newest main file), then any newer hotfix/patch main files to go on top. */
export function mainFiles(files: NexusFile[]): NexusFile[] {
  const main = files
    .filter((f) => f.id > 0 && (f.category.toUpperCase() === 'MAIN' || f.primary))
    .sort((a, b) => b.at - a.at);
  const base =
    main.find((f) => f.primary) ?? main.find((f) => !HOTFIX.test(f.name)) ?? main[0] ?? null;
  if (!base) return [];
  const extras = main.filter((f) => f !== base && f.at > base.at && HOTFIX.test(f.name)).reverse();
  return [base, ...extras];
}

/* ── RedRequire(red4ext\plugins\RedRequire\report.txt): why the scripts didn't compile ── */

export interface ScriptNeed {
  /** The script folder (mod) that failed, e.g. "ImmersiveVDialogueExpanded". */
  mod: string;
  /** What it needs, as RedRequire names it (a script module or plugin, e.g. "AudioXL"). */
  needs: string;
  /** "requires a newer X than yours" (otherwise X is missing). */
  newer: boolean;
  /** Names the compiler couldn't find (functions, classes, modules). */
  symbols: string[];
}

/** Read RedRequire's report. */
export function parseRedRequire(text: string): ScriptNeed[] {
  const out: ScriptNeed[] = [];
  let cur: ScriptNeed | null = null;
  for (const line of text.split(/\r?\n/)) {
    const head =
      /^\*\s+(\S+)\s+requires\s+(a newer\s+)?(\S+?)(?:,\s*which you do not have|\s+than yours)?\.?\s*$/i.exec(
        line,
      );
    if (head?.[1] && head[3]) {
      cur = { mod: head[1], needs: head[3], newer: !!head[2], symbols: [] };
      out.push(cur);
      continue;
    }
    const miss = /^\s+missing:\s*(.+)$/i.exec(line);
    if (miss?.[1] && cur)
      cur.symbols = miss[1]
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^[\w.]+$/.test(s));
  }
  return out;
}

/** Does this redscript source define `symbol` (a module, function, class, struct or enum)? */
export function definesSymbol(src: string, symbol: string): boolean {
  if (!/^[\w.]+$/.test(symbol)) return false;
  const esc = symbol.split('.').join('[.]');
  return new RegExp(
    `^[ \\t]*(?:module[ \\t]+${esc}(?![\\w.])|(?:[@\\w()"]+[ \\t]+)*(?:func|class|struct|enum)[ \\t]+${esc}\\b)`,
    'm',
  ).test(src);
}

/** Does a mod (its game-relative files) provide `name`: scripts in r6\scripts\<name> or a
 *  RED4ext plugin DLL in red4ext\plugins\<name>? (Other mods often drop sounds or settings into
 *  someone else's folder; that doesn't make them the mod.) */
export function providesName(files: string[], name: string): boolean {
  const n = name.toLowerCase();
  return files.some((f) => {
    const p = f.replace(/\\/g, '/').toLowerCase();
    return (
      (p.startsWith(`r6/scripts/${n}/`) && p.endsWith('.reds')) ||
      (p.startsWith(`red4ext/plugins/${n}/`) && p.endsWith('.dll'))
    );
  });
}
