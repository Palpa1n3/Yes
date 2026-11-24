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
