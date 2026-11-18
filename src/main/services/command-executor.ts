/** Command executor (main process only).
 *  launch_app: apps.json entry → exe path / Start-menu lookup / URI, else Start-menu
 *  lookup by name. Launched apps are detached so they outlive ARC. URLs and searches
 *  open in the default browser. Every failure is a readable CommandResult, never a throw.
 *  OS access is injected (ExecutorDeps) so the logic is testable without Electron. */
import type { CanonicalCommand, CommandResult } from '@shared/commands';
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
}

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
        case 'unknown':
          return done('failed', `I don't know how to “${cmd.rawAction ?? 'do that'}” yet.`);
      }
    } catch (err) {
      return done('failed', err instanceof Error ? err.message : 'That command failed.');
    }
  };
}
