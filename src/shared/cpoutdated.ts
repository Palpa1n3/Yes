/** "Remove outdated mods": Vortex mods with real evidence they don't work on the current game
 *  version (not just "old"): RED4ext plugins older than the update, REDmods whose scripts stop
 *  REDmod's compile, script files the compiler reports errors in, and tweaks TweakXL rejects.
 *  Each finding is traced to the Vortex mod that installed the file. Pure; tested in
 *  tests/cpoutdated.test.ts. */

export interface OutdatedMod {
  /** Vortex's mod folder. */
  folder: string;
  name: string;
  modId: number | null;
  reasons: string[];
  /** Nexus has a newer version: updating may be better than removing. */
  hasUpdate: boolean;
}

const norm = (p: string): string => p.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();

/** Game-relative path (any case, either slash) → the Vortex mod folder that installed it. */
export function ownerIndex(mods: Array<{ folder: string; files: string[] }>): Map<string, string> {
  const m = new Map<string, string>();
  for (const mod of mods)
    for (const f of mod.files)
      if (!/__folder_managed_by_vortex$/i.test(f)) m.set(norm(f), mod.folder);
  return m;
}

/** The Vortex mod owning a path, or owning anything inside a folder path. */
export function ownerOf(index: Map<string, string>, path: string): string | null {
  const p = norm(path);
  const direct = index.get(p);
  if (direct) return direct;
  const prefix = p.endsWith('/') ? p : `${p}/`;
  for (const [k, v] of index) if (k.startsWith(prefix)) return v;
  return null;
}

/** Record ids TweakXL rejected ("Items.Misoru_Boomerang…" from its [error] lines). */
export function tweakRecordIds(tweakLog: string): string[] {
  const ids = new Set<string>();
  for (const l of tweakLog.split(/\r?\n/)) {
    if (!/\]\s*\[error\]/i.test(l)) continue;
    const rec = /\[error\]\s*([A-Za-z0-9_]+\.[A-Za-z0-9_]+)/i.exec(l)?.[1];
    if (rec) ids.add(rec);
  }
  return [...ids];
}

/** The tweak file that defines a record (a top-level "Id:" or "[Id]" / "Id :" line). */
export function definesRecord(text: string, id: string): boolean {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `^\\s*(?:${esc}\\s*:|\\[?${esc}\\]?\\s*(?::|=|$)|${esc}\\s*:\\s*\\w)`,
    'm',
  ).test(text);
}

/** Script files the redscript compiler reported errors in (game-relative, "r6/scripts/…"). */
export function redscriptErrorFiles(log: string): string[] {
  const out = new Set<string>();
  for (const l of log.split(/\r?\n/)) {
    if (!/^\[ERROR/i.test(l)) continue;
    const m = /(r6[\\/]scripts[\\/][^:]+?\.reds)/i.exec(l);
    if (m?.[1]) out.add(m[1].replace(/\\/g, '/'));
  }
  return [...out];
}

export interface Evidence {
  /** RED4ext plugin folders whose DLLs are older than the game update. */
  oldPlugins: string[];
  /** REDmod names whose scripts stop REDmod's compile. */
  redmodScripts: string[];
  /** "r6/scripts/…" files with compile errors. */
  scriptErrors: string[];
  /** Tweak files (game-relative) defining records TweakXL rejected, with the record. */
  tweakFiles: Array<{ file: string; record: string }>;
  /** Plugins Alton already switched off because the game crashed inside them. */
  crashPlugins: string[];
  gameVersion: string;
}

/** Turn the evidence into a list of Vortex mods with reasons (one entry per mod). */
/** Frameworks and libraries other mods are built on: never "outdated" (removing one breaks
 *  dozens of mods, and their own errors usually mean something else is missing). */
export const FRAMEWORK_MOD =
  /codeware|tweak ?xl|archive ?xl|red4ext|cyber ?engine ?tweaks|\bcet\b|redscript|mod[ _]?settings|input[ _]?loader|audioware|native ?settings|unified mod settings|red ?file ?system|red ?http ?client|red ?data|red ?functions|red ?logger|red ?require|red ?rcf ?input|red ?img ?retriever|red ?windows|config framework|perk addition framework|appearance runtime plugin|address library/i;

/** Script errors that are a knock-on effect (a missing framework), not a broken mod. */
export function scriptErrorsCascade(log: string, files: string[], owners: Set<string>): boolean {
  return /UNRESOLVED_IMPORT|UNRESOLVED_TYPE|Codeware|depends on/i.test(log) && files.length > 3
    ? true
    : owners.size > 8;
}

/** At most this many mods are removed in one go (a bigger list means the evidence is wrong). */
export const MAX_REMOVE = 12;

export function collectOutdated(
  ev: Evidence,
  index: Map<string, string>,
  mods: Array<{ folder: string; name: string; modId: number | null }>,
  updates: Set<number>,
): OutdatedMod[] {
  const byFolder = new Map<string, OutdatedMod>();
  const add = (folder: string | null, reason: string): void => {
    if (!folder) return;
    const name = mods.find((x) => x.folder === folder)?.name ?? folder;
    if (FRAMEWORK_MOD.test(name)) return;
    const m = mods.find((x) => x.folder === folder);
    const cur =
      byFolder.get(folder) ??
      ({
        folder,
        name: m?.name ?? folder,
        modId: m?.modId ?? null,
        reasons: [],
        hasUpdate: m?.modId != null && updates.has(m.modId),
      } satisfies OutdatedMod);
    if (!cur.reasons.includes(reason)) cur.reasons.push(reason);
    byFolder.set(folder, cur);
  };
  const v = ev.gameVersion ? ` ${ev.gameVersion}` : '';
  for (const p of ev.oldPlugins)
    add(
      ownerOf(index, `red4ext/plugins/${p}`),
      `Its RED4ext plugin (${p}) is older than the game’s${v} update.`,
    );
  for (const p of ev.crashPlugins)
    add(ownerOf(index, `red4ext/plugins/${p}`), `The game kept crashing inside its plugin (${p}).`);
  for (const r of ev.redmodScripts)
    add(ownerOf(index, `mods/${r}`), `Its REDmod scripts stop REDmod’s script compile.`);
  for (const f of ev.scriptErrors)
    add(ownerOf(index, f), `The script compiler reports errors in ${f.split('/').pop()}.`);
  for (const t of ev.tweakFiles)
    add(ownerOf(index, t.file), `TweakXL rejects its change to ${t.record}.`);
  return [...byFolder.values()].sort(
    (a, b) => b.reasons.length - a.reasons.length || a.name.localeCompare(b.name),
  );
}

/** Where a removed mod's files go (inside the game folder, so moving is instant). */
export const QUARANTINE = '_alton_removed_mods';
