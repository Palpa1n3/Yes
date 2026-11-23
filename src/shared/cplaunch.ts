/** "Why won't Cyberpunk start?": reads RED4ext's launch logs (one per launch), the plugins'
 *  file dates and the redscript log, and says where launches stop, which plugin is older than
 *  the current game patch, and what to do. Pure; tested in tests/cplaunch.test.ts. */

export interface LaunchLog {
  /** "red4ext-2026-11-23-22-54-07.log" (the name sorts by time). */
  name: string;
  text: string;
}

export interface PluginFile {
  /** The plugin's folder under red4ext\plugins. */
  plugin: string;
  /** Newest .dll in it (ms). */
  modified: number;
}

export interface LaunchRun {
  at: number;
  gameVersion: string;
  /** How far it got. */
  outcome:
    'stopped-loading' | 'plugins-loaded' | 'scripts-ok' | 'scripts-failed' | 'closed' | 'unknown';
  /** The plugin it was loading when the log ends (stopped-loading only). */
  stoppedOn: string | null;
  loaded: number;
}

export interface LaunchReport {
  runs: LaunchRun[];
  gameVersion: string;
  /** When the game changed to this version (first launch seen on it), 0 if not seen. */
  patchSeen: number;
  /** The last launch that got past loading plugins, 0 if none in the logs. */
  lastGood: number;
  /** The plugin the recent launches keep stopping on, and how many in a row. */
  culprit: { plugin: string; times: number } | null;
  /** Plugins whose files are older than the patch (they may not support it). */
  outdated: string[];
  scriptErrors: string[];
  verdict: string;
}

const TS = /^\[(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/;
const stamp = (m: RegExpExecArray | null): number => {
  if (!m) return 0;
  const n = m.slice(1, 7).map(Number);
  return new Date(n[0] ?? 0, (n[1] ?? 1) - 1, n[2] ?? 1, n[3] ?? 0, n[4] ?? 0, n[5] ?? 0).getTime();
};
const at = (line: string): number => stamp(TS.exec(line));
const fromName = (name: string): number =>
  stamp(/(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/.exec(name));

/** What one RED4ext log says about its launch. */
export function readRun(log: LaunchLog): LaunchRun {
  const lines = log.text.split(/\r?\n/).filter((l) => l.trim());
  const first = lines[0] ?? '';
  const gameVersion = /Product version: (\S+)/.exec(log.text)?.[1] ?? '';
  const loaded = (log.text.match(/has been loaded/g) ?? []).length;
  const last = lines[lines.length - 1] ?? '';
  let outcome: LaunchRun['outcome'] = 'unknown';
  let stoppedOn: string | null = null;
  if (/has been shut down|plugin\(s\) unloaded/.test(log.text)) outcome = 'closed';
  else if (/scc invoked successfully|Scripts blob path was updated/i.test(log.text))
    outcome = 'scripts-ok';
  else if (/scc.*(fail|error)|compil\w* (fail|error)/i.test(log.text)) outcome = 'scripts-failed';
  else if (/plugin\(s\) loaded|RED4ext has been started/.test(log.text)) outcome = 'plugins-loaded';
  else if (/Loading plugin from/.test(last)) {
    outcome = 'stopped-loading';
    stoppedOn = /plugins[\\/]([^\\/]+)[\\/]/.exec(last)?.[1] ?? null;
  }
  return { at: at(first) || fromName(log.name), gameVersion, outcome, stoppedOn, loaded };
}

export function diagnoseLaunch(
  logs: LaunchLog[],
  plugins: PluginFile[],
  redscriptLog = '',
): LaunchReport {
  const runs = [...logs].sort((a, b) => a.name.localeCompare(b.name)).map(readRun);
  const latest = runs[runs.length - 1];
  const gameVersion = latest?.gameVersion ?? '';
  // When the current version first appears after a different one.
  let patchSeen = 0;
  for (const r of [...runs].reverse()) {
    if (r.gameVersion !== gameVersion) break;
    patchSeen = r.at;
  }
  const good = (r: LaunchRun): boolean =>
    r.outcome !== 'stopped-loading' && r.outcome !== 'unknown';
  const lastGood = [...runs].reverse().find(good)?.at ?? 0;
  // The same plugin at the end of the most recent launches.
  let culprit: LaunchReport['culprit'] = null;
  for (const r of [...runs].reverse()) {
    if (r.outcome !== 'stopped-loading' || !r.stoppedOn) break;
    if (!culprit) culprit = { plugin: r.stoppedOn, times: 1 };
    else if (culprit.plugin === r.stoppedOn) culprit.times++;
    else break;
  }
  const outdated = patchSeen
    ? plugins
        .filter((p) => p.modified > 0 && p.modified < patchSeen - 86_400_000)
        .map((p) => p.plugin)
        .sort()
    : [];
  const scriptErrors = redscriptLog
    .split(/\r?\n/)
    .filter((l) => /^\[ERROR/.test(l) || /\berror\b.*\.reds/i.test(l))
    .slice(-8);

  const parts: string[] = [];
  if (!runs.length)
    parts.push('There are no RED4ext launch logs yet, so I can’t see what happens at start-up.');
  else if (latest && good(latest))
    parts.push(
      latest.outcome === 'closed'
        ? 'The last launch started and closed normally.'
        : 'The last launch got past loading the mod plugins, so the problem is later on (scripts, archives or the game itself).',
    );
  if (culprit) {
    const old = outdated.includes(culprit.plugin);
    parts.push(
      `The game crashes while loading the RED4ext plugin “${culprit.plugin}” (${culprit.times} launch${culprit.times === 1 ? '' : 'es'} in a row).${old ? ` It’s older than the game’s ${gameVersion} update, so it probably doesn’t support it.` : ''} Update it, or disable it in Vortex and deploy.`,
    );
  }
  if (patchSeen && gameVersion)
    parts.push(
      `The game is on ${gameVersion} since ${new Date(patchSeen).toLocaleDateString('en-GB')}${lastGood && lastGood < patchSeen ? `; the last launch that loaded every plugin was ${new Date(lastGood).toLocaleDateString('en-GB')}, before that update` : ''}.`,
    );
  const others = outdated.filter((p) => p !== culprit?.plugin);
  if (others.length)
    parts.push(
      `Also older than the update: ${others.join(', ')}. If it still won’t start, update these next.`,
    );
  if (scriptErrors.length && (!culprit || (latest && good(latest))))
    parts.push(
      `The script compiler reported ${scriptErrors.length} error${scriptErrors.length === 1 ? '' : 's'} (see below).`,
    );
  return {
    runs: runs.slice(-12),
    gameVersion,
    patchSeen,
    lastGood,
    culprit,
    outdated,
    scriptErrors,
    verdict: parts.join(' '),
  };
}

/* ── REDmod (tools\redmod\bin\REDmodLog.txt, appended on every deploy) ── */
export interface RedmodReport {
  /** The last deploy failed (and at which step, e.g. "Script Compilation"). */
  failed: boolean;
  stage: string;
  error: string;
  /** REDmods in the last deploy that change game scripts or tweaks (the usual suspects). */
  scriptMods: string[];
  mods: string[];
  verdict: string;
}

export function redmodReport(log: string): RedmodReport | null {
  const runs = log
    .split(/(?=^Copyright \(c\) 20\d\d)/m)
    .filter((r) => /\[DEPLOY\]|Found mod/.test(r));
  const last = runs[runs.length - 1];
  if (!last) return null;
  const mods: string[] = [];
  const scriptMods: string[] = [];
  for (const m of last.matchAll(/^Found mod "([^"]+)".*\(([^)]*)\)\s*$/gm)) {
    const name = m[1] ?? '';
    mods.push(name);
    if (/SCRIPTS/.test(m[0])) scriptMods.push(name);
  }
  const failed = /Commandlet deploy has failed/.test(last);
  const stages = [...last.matchAll(/\[DEPLOY\] Stage \d+\/\d+ - (.+)$/gm)];
  const stage = failed ? (stages[stages.length - 1]?.[1]?.trim() ?? '') : '';
  const error = /^ERROR: (.+)$/m.exec(last)?.[1]?.trim() ?? '';
  let verdict = '';
  if (failed) {
    verdict = `REDmod’s last deploy failed${stage ? ` at “${stage}”` : ''}${error ? `: ${error}` : ''}.`;
    if (/script/i.test(stage + error) && scriptMods.length)
      verdict += ` The REDmod${scriptMods.length === 1 ? '' : 's'} that change game scripts: ${scriptMods.join(', ')}. Scripts written for an older game version stop the compile after an update: update ${scriptMods.length === 1 ? 'it' : 'them'}, or disable ${scriptMods.length === 1 ? 'it' : 'them'} in Vortex and deploy again.`;
    else if (/sound/i.test(stage + error))
      verdict += ' A REDmod with custom sounds has a problem: check the ones marked CUSTOMSOUNDS.';
  }
  return { failed, stage, error, scriptMods, mods, verdict };
}
