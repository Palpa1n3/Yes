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
