/** Command executor (main process only).
 *  launch_app: apps.json entry → exe path / Start-menu lookup / URI, else Start-menu
 *  lookup by name. Launched apps are detached so they outlive ARC. URLs and searches
 *  open in the default browser. Every failure is a readable CommandResult, never a throw.
 *  OS access is injected (ExecutorDeps) so the logic is testable without Electron. */
import {
  MEDIA_KEYS,
  type CanonicalCommand,
  type CommandResult,
  type MediaKey,
} from '@shared/commands';
import { USER_FOLDERS, type UserFolder } from '@shared/types';
import type { SystemActions } from './system-actions';
import type { AppEntry, AppRegistry } from './app-registry';

export interface StartApp {
  name: string;
  appId: string;
}

export interface ExecutorDeps {
  platform: NodeJS.Platform;
  registry: AppRegistry;
  env: Record<string, string | undefined>;
  fileExists(path: string): boolean;
  /** Start a detached process; resolves once it has spawned, rejects if it can't. */
  spawnDetached(command: string, args: string[]): Promise<void>;
  /** Open a URL/URI with its registered handler (Electron shell.openExternal). */
  openExternal(uri: string): Promise<void>;
  /** Installed apps from the Start menu (Windows); [] elsewhere. */
  listStartApps(): Promise<StartApp[]>;
  /** Whether an installed app handles a URI scheme like "spotify". The OS accepts
   *  unhandled links too, so without this check a missing app would look like success. */
  uriHandlerExists(scheme: string): Promise<boolean>;
  /** Closing apps, volume, media, folders, files, timers, lock (optional per platform). */
  system?: SystemActions;
}

/** Common display names → Windows process names (without .exe). */
const PROCESS_ALIASES: Record<string, string[]> = {
  'vs code': ['Code'],
  'visual studio code': ['Code'],
  vscode: ['Code'],
  code: ['Code'],
  'google chrome': ['chrome'],
  chrome: ['chrome'],
  'microsoft edge': ['msedge'],
  edge: ['msedge'],
  firefox: ['firefox'],
  opera: ['opera'],
  'opera gx': ['opera'],
  spotify: ['Spotify'],
  discord: ['Discord'],
  steam: ['steam'],
  obs: ['obs64'],
  'obs studio': ['obs64'],
  obsidian: ['Obsidian'],
  notepad: ['notepad'],
  'task manager': ['Taskmgr'],
  calculator: ['CalculatorApp'],
  terminal: ['WindowsTerminal'],
  teams: ['ms-teams', 'Teams'],
  outlook: ['olk', 'OUTLOOK'],
  word: ['WINWORD'],
  excel: ['EXCEL'],
};

/** Candidate process names for an app the user named. */
export function processNamesFor(target: string, registry: AppRegistry): string[] {
  const q = norm(target);
  const entry = registry.find(target);
  const names = [
    ...(PROCESS_ALIASES[q] ?? []),
    ...(entry ? (PROCESS_ALIASES[norm(entry.name)] ?? []) : []),
    ...(entry?.path && /\.exe$/i.test(entry.path)
      ? [(entry.path.split(/[\\/]/).pop() ?? '').replace(/\.exe$/i, '')]
      : []),
    q.replace(/ /g, ''),
  ];
  return [...new Set(names.filter(Boolean))];
}

const FOLDERS = new Set<string>(USER_FOLDERS);
const MEDIA = new Set<string>(MEDIA_KEYS);
const MEDIA_LABEL: Record<MediaKey, string> = {
  play_pause: 'Play/pause',
  next: 'Next track',
  previous: 'Previous track',
  stop: 'Stop',
};

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Expand %VAR% (Windows) and $VAR / ~ (POSIX) in a path. */
export function expandPath(p: string, env: ExecutorDeps['env']): string {
  return p
    .replace(/%([^%]+)%/g, (m, k: string) => env[k] ?? env[k.toUpperCase()] ?? m)
    .replace(/^~(?=$|[\\/])/, env['HOME'] ?? env['USERPROFILE'] ?? '~')
    .replace(/\$([A-Z_][A-Z0-9_]*)/gi, (m, k: string) => env[k] ?? m);
}

/** Best Start-menu match: exact name, then starts-with, then whole-word contains. */
export function matchStartApp(apps: StartApp[], query: string): StartApp | undefined {
  const q = norm(query);
  if (!q) return undefined;
  const named = apps.map((a) => ({ a, n: norm(a.name) }));
  const ignore = /uninstall|readme|help|documentation|website|release notes/;
  const ok = named.filter(({ n }) => !ignore.test(n));
  return (
    ok.find(({ n }) => n === q)?.a ??
    ok.find(({ n }) => n.startsWith(`${q} `))?.a ??
    ok.find(({ n }) => ` ${n} `.includes(` ${q} `))?.a
  );
}

/** Turn "github.com" or "https://x" into a safe http(s) URL, or null. */
export function toWebUrl(target: string): string | null {
  const t = target.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function createExecutor(
  deps: ExecutorDeps,
): (cmd: CanonicalCommand) => Promise<CommandResult> {
  const startAppsCache = { at: 0, apps: [] as StartApp[] };
  const startApps = async (): Promise<StartApp[]> => {
    if (Date.now() - startAppsCache.at < 5 * 60_000 && startAppsCache.apps.length)
      return startAppsCache.apps;
    try {
      startAppsCache.apps = await deps.listStartApps();
      startAppsCache.at = Date.now();
    } catch {
      startAppsCache.apps = [];
    }
    return startAppsCache.apps;
  };

  const launchFromStartMenu = async (query: string): Promise<string | null> => {
    if (deps.platform !== 'win32') return null;
    const hit = matchStartApp(await startApps(), query);
    if (!hit) return null;
    await deps.spawnDetached('explorer.exe', [`shell:AppsFolder\\${hit.appId}`]);
    return hit.name;
  };

  /** Try each way an entry can be launched, in order of reliability. */
  const launchEntry = async (
    e: AppEntry,
  ): Promise<{ ok: true } | { ok: false; reason: string }> => {
    let reason = `${e.name} doesn't appear to be installed.`;
    if (e.path) {
      const p = expandPath(e.path, deps.env);
      const isBare = !/[\\/]/.test(p); // e.g. "calc.exe", resolved via PATH
      if (isBare || deps.fileExists(p)) {
        try {
          await deps.spawnDetached(p, e.args ?? []);
          return { ok: true };
        } catch (err) {
          reason = `Couldn't start ${p}: ${err instanceof Error ? err.message : 'unknown error'}.`;
        }
      } else {
        reason = `${e.name} isn't at ${p}. Update its path in apps.json.`;
      }
    }
    if (await launchFromStartMenu(e.startMenu ?? e.name)) return { ok: true };
    const scheme = e.uri?.match(/^([a-z][a-z0-9+.-]*):/i)?.[1];
    if (e.uri && scheme && (await deps.uriHandlerExists(scheme))) {
      try {
        await deps.openExternal(e.uri);
        return { ok: true };
      } catch {
        /* fall through */
      }
    }
    if (deps.platform === 'darwin') {
      try {
        await deps.spawnDetached('open', ['-a', e.startMenu ?? e.name]);
        return { ok: true };
      } catch {
        /* fall through */
      }
    }
    return { ok: false, reason };
  };

  const runSystemAction = async (cmd: CanonicalCommand, target: string): Promise<CommandResult> => {
    const done = (status: CommandResult['status'], message: string): CommandResult => ({
      commandId: cmd.id,
      status,
      message,
      timestamp: Date.now(),
    });
    const sys = deps.system;
    if (cmd.action === 'unknown')
      return done('failed', `I don't know how to “${cmd.rawAction ?? 'do that'}” yet.`);
    if (!sys) return done('failed', "That action isn't available on this system.");
    switch (cmd.action) {
      case 'close_app': {
        if (!target) return done('failed', 'Which app should I close?');
        const r = await sys.closeApp(processNamesFor(target, deps.registry));
        return done(r.ok ? 'success' : 'failed', r.message);
      }
      case 'set_volume': {
        const level = target ? Number(target) : undefined;
        if (level !== undefined && (!Number.isFinite(level) || level < 0 || level > 100))
          return done('failed', 'Volume must be between 0 and 100.');
        const mute = cmd.args?.includes('mute')
          ? true
          : cmd.args?.includes('unmute')
            ? false
            : undefined;
        if (level === undefined && mute === undefined)
          return done('failed', 'Tell me a volume level or mute/unmute.');
        const r = await sys.setVolume({ level, mute });
        return done('success', r.muted ? `Muted (volume ${r.level}%).` : `Volume is ${r.level}%.`);
      }
      case 'media_control': {
        if (!MEDIA.has(target)) return done('failed', `Unknown media action “${target}”.`);
        await sys.mediaKey(target as MediaKey);
        return done('success', `${MEDIA_LABEL[target as MediaKey]} sent to your media player.`);
      }
      case 'open_folder': {
        const id = target.toLowerCase();
        if (!FOLDERS.has(id)) return done('failed', `I can open ${USER_FOLDERS.join(', ')}.`);
        return (await sys.openFolder(id as UserFolder))
          ? done('success', `Opened your ${id} folder.`)
          : done('failed', `Your ${id} folder doesn't exist.`);
      }
      case 'find_files': {
        if (target.length < 2) return done('failed', 'What should I search for?');
        const hits = await sys.findFiles(target);
        if (hits.length === 0)
          return done(
            'success',
            `No files matching “${target}” in your Documents, Downloads, Desktop, Pictures, Videos or Music.`,
          );
        const list = hits
          .map((h) => `${h.path} (${new Date(h.modified).toLocaleDateString()})`)
          .join('\n');
        return done('success', `Found ${hits.length} file${hits.length > 1 ? 's' : ''}:\n${list}`);
      }
      case 'reveal_file':
        return (await sys.revealFile(target))
          ? done('success', 'Shown in File Explorer.')
          : done(
              'failed',
              'I can only show files that exist inside your own folders (Documents, Downloads, Desktop, Pictures, Videos, Music).',
            );
      case 'set_timer': {
        const minutes = Number(target);
        if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 24 * 60)
          return done('failed', 'Timers can be from a few seconds up to 24 hours.');
        const label = (cmd.args?.[0] ?? '').slice(0, 120);
        const focus = cmd.args?.[1] === 'focus';
        const due = sys.setTimer(minutes, focus ? label || 'Focus session' : label, focus);
        if (focus)
          return done(
            'success',
            `Focus session until ${due.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Suggestions and alerts stay quiet till then.`,
          );
        return done(
          'success',
          `Timer set for ${due.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${label ? `: ${label}` : ''}.`,
        );
      }
      case 'cancel_timer': {
        const gone = sys.cancelTimers(target);
        if (gone.length === 0)
          return done(
            'failed',
            target && target !== 'all'
              ? `No timer matching “${target}”.`
              : 'There are no timers running.',
          );
        return done(
          'success',
          `Cancelled ${gone.length === 1 ? gone[0] : `${gone.length} timers`}.`,
        );
      }
      case 'lock_screen':
        await sys.lockScreen();
        return done('success', 'Locked.');
      default:
        return done('failed', `I can't do “${cmd.action}” yet.`);
    }
  };

  return async (cmd) => {
    const done = (status: CommandResult['status'], message: string): CommandResult => ({
      commandId: cmd.id,
      status,
      message,
      timestamp: Date.now(),
    });
    const target = cmd.target?.trim() ?? '';

    try {
      switch (cmd.action) {
        case 'launch_app': {
          if (!target) return done('failed', 'No application was specified.');
          const entry = deps.registry.find(target);
          if (entry) {
            const r = await launchEntry(entry);
            return r.ok ? done('success', `Opened ${entry.name}.`) : done('failed', r.reason);
          }
          // Not in apps.json: look it up among installed apps.
          const name = await launchFromStartMenu(target);
          if (name) return done('success', `Opened ${name}.`);
          if (deps.platform === 'darwin') {
            await deps.spawnDetached('open', ['-a', target]);
            return done('success', `Opened ${target}.`);
          }
          return done(
            'failed',
            `I couldn't find “${target}” installed. You can add it to apps.json.`,
          );
        }
        case 'open_url': {
          const url = toWebUrl(target);
          if (!url) return done('failed', `“${target}” isn't a web address I can open.`);
          await deps.openExternal(url);
          return done('success', `Opened ${new URL(url).host}.`);
        }
        case 'search_web': {
          if (!target) return done('failed', 'Nothing to search for.');
          await deps.openExternal(`https://www.google.com/search?q=${encodeURIComponent(target)}`);
          return done('success', `Searched the web for “${target}”.`);
        }
        case 'system_query':
          return done('success', 'System diagnostic complete.');
        default:
          return await runSystemAction(cmd, target);
      }
    } catch (err) {
      return done('failed', err instanceof Error ? err.message : 'That command failed.');
    }
  };
}
