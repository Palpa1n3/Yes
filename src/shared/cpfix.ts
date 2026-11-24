/** Fixing Cyberpunk launch problems by itself: what to do about a crashing RED4ext plugin or a
 *  failing REDmod deploy, and editing RED4ext's ignore list. Every fix can be undone. Pure;
 *  tested in tests/cpfix.test.ts. */
import type { LaunchReport, RedmodReport } from './cplaunch';

export type FixAction =
  /** Nexus has a newer version: send it to Vortex (Premium) or open its page. */
  | { kind: 'update'; modId: number; name: string; plugin: string; why?: string }
  /** A mod the scripts need is installed but off (or saved by Alton): switch it back on. */
  | { kind: 'switch-on'; folder: string; name: string; for: string; saved: boolean }
  /** The game crashed right after this mod was put back: save it away again. */
  | { kind: 'save-mod'; folder: string; name: string; why: string }
  /** No update: RED4ext skips the plugin (red4ext\config.ini [plugins] ignored). */
  | { kind: 'ignore-plugin'; plugin: string; mod: string; why?: 'start' | 'crash' }
  /** REDmod's script compile fails: deploy again without the REDmods that change scripts. */
  | { kind: 'redmod-without'; mods: string[] }
  /** Patches loading after the mods they patch: save the fixed archive load order
   *  (`previous` = the modlist.txt before, null = none, for Undo). */
  | {
      kind: 'load-order';
      moves: Array<{ archive: string; before: string }>;
      previous: string | null;
    };

export interface FixRecord {
  id: string;
  at: number;
  action: FixAction;
  /** What Alton said it did. */
  note: string;
  undone: boolean;
  /** Switched-off plugin: its newest DLL's date then, to notice when it's updated. */
  stamp?: number;
}

/** What to do, from the launch check. `updateFor` = the culprit plugin's Vortex mod, if Nexus
 *  has a newer version. Nothing already ignored is ignored again. */
export function planFixes(o: {
  report: Pick<LaunchReport, 'culprit' | 'outdated'>;
  redmod: Pick<RedmodReport, 'failed' | 'stage' | 'error' | 'scriptMods'> | null;
  culpritMod: { name: string; modId: number | null } | null;
  updateFor: { modId: number; name: string } | null;
  ignored: string[];
  /** REDmods already left out by Alton. */
  redmodSkipped: string[];
  /** A mod plugin the game keeps crashing in while playing (from the crash reports). */
  crashCulprit?: { plugin: string; mod: string } | null;
}): FixAction[] {
  const out: FixAction[] = [];
  const cc = o.crashCulprit;
  if (
    cc &&
    !o.ignored.some((i) => i.toLowerCase() === cc.plugin.toLowerCase()) &&
    cc.plugin.toLowerCase() !== o.report.culprit?.plugin.toLowerCase()
  )
    out.push({ kind: 'ignore-plugin', plugin: cc.plugin, mod: cc.mod, why: 'crash' });
  const c = o.report.culprit;
  if (c && !o.ignored.some((i) => i.toLowerCase() === c.plugin.toLowerCase())) {
    if (o.updateFor)
      out.push({
        kind: 'update',
        modId: o.updateFor.modId,
        name: o.updateFor.name,
        plugin: c.plugin,
      });
    else out.push({ kind: 'ignore-plugin', plugin: c.plugin, mod: o.culpritMod?.name ?? c.plugin });
  }
  const r = o.redmod;
  if (r?.failed && /script/i.test(`${r.stage} ${r.error}`)) {
    const mods = r.scriptMods.filter((m) => !o.redmodSkipped.includes(m));
    if (mods.length) out.push({ kind: 'redmod-without', mods });
  }
  return out;
}

/* ── red4ext\config.ini: [plugins] ignored = ["A", "B"] ── */
const IGNORED = /^(\s*ignored\s*=\s*)\[([^\]]*)\]/m;

export function ignoredPlugins(ini: string): string[] {
  const m = IGNORED.exec(sectionOf(ini));
  if (!m) return [];
  return [...(m[2] ?? '').matchAll(/"([^"]*)"|'([^']*)'/g)]
    .map((x) => x[1] ?? x[2] ?? '')
    .filter(Boolean);
}

/** The [plugins] section (where `ignored` lives). */
function sectionOf(ini: string): string {
  const i = ini.search(/^\[plugins\]\s*$/m);
  if (i < 0) return '';
  const rest = ini.slice(i);
  const next = rest.slice(1).search(/^\[/m);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

const list = (names: string[]): string => `[${names.map((n) => JSON.stringify(n)).join(', ')}]`;

/** The ini with `plugin` added to / removed from the ignore list (adds the section if missing). */
export function setIgnored(ini: string, plugin: string, ignore: boolean): string {
  const now = ignoredPlugins(ini);
  const has = now.some((p) => p.toLowerCase() === plugin.toLowerCase());
  const next = ignore
    ? has
      ? now
      : [...now, plugin]
    : now.filter((p) => p.toLowerCase() !== plugin.toLowerCase());
  const sec = sectionOf(ini);
  if (!sec)
    return `${ini.replace(/\s*$/, '')}\n\n[plugins]\nenabled = true\nignored = ${list(next)}\n`;
  const newSec = IGNORED.test(sec)
    ? sec.replace(IGNORED, (_m, lead: string) => `${lead}${list(next)}`)
    : sec.replace(/^\[plugins\]\s*$/m, (h) => `${h}\nignored = ${list(next)}`);
  return ini.replace(sec, newSec);
}

/** A one-line summary for a notification. */
export function describeFix(a: FixAction): string {
  if (a.kind === 'load-order') {
    const names = (x: string): string => x.replace(/\.archive$/i, '');
    const first = a.moves
      .slice(0, 3)
      .map((m) => `${names(m.archive)} ahead of ${names(m.before)}`)
      .join(', ');
    return `Fixed the load order so patches win: ${first}${a.moves.length > 3 ? ` and ${a.moves.length - 3} more` : ''}.`;
  }
  if (a.kind === 'save-mod')
    return `Switched ${a.name} off again (saved, not deleted): ${a.why}. Undo puts it back.`;
  if (a.kind === 'switch-on')
    return `Switching ${a.name} back on: ${a.for} needs it and its scripts didn’t compile without it${a.saved ? ' (Alton had saved it away earlier)' : ''}. Alton closes Vortex for a moment to do it, then opens it again and deploys.`;
  if (a.kind === 'update' && a.why) return `Sent ${a.name} from Nexus to Vortex: ${a.why}`;
  if (a.kind === 'update')
    return `Sent the update for ${a.name} (the ${a.plugin} plugin that crashed the game).`;
  if (a.kind === 'ignore-plugin' && a.why === 'crash')
    return `Switched off the ${a.plugin} plugin (from ${a.mod}): the game kept crashing inside it while you played. Its mod stays installed; update it later and undo this.`;
  if (a.kind === 'ignore-plugin')
    return `Switched off the ${a.plugin} plugin (from ${a.mod}), which crashed the game on start-up. Its mod stays installed; update it later and undo this.`;
  return `Deployed REDmod again without ${a.mods.join(', ')}, whose scripts stopped the compile. Disable ${a.mods.length === 1 ? 'it' : 'them'} in Vortex too, or Vortex adds ${a.mods.length === 1 ? 'it' : 'them'} back on its next deploy.`;
}
