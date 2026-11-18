/** Real OS bindings for the executor (Electron main process). */
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { shell } from 'electron';
import type { ExecutorDeps, StartApp } from './command-executor';

export function spawnDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // No shell: arguments are passed verbatim, so names from the AI can't inject commands.
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: false });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref(); // launched apps outlive ARC
      resolve();
    });
  });
}

/** Windows: installed apps (desktop + Store) via Get-StartApps. */
export function listStartApps(): Promise<StartApp[]> {
  if (process.platform !== 'win32') return Promise.resolve([]);
  const script =
    '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress';
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: 10_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve([]);
        try {
          const raw: unknown = JSON.parse(stdout || '[]');
          const list = Array.isArray(raw) ? raw : [raw];
          resolve(
            list
              .filter(
                (x): x is { Name: string; AppID: string } =>
                  !!x && typeof x.Name === 'string' && typeof x.AppID === 'string',
              )
              .map((x) => ({ name: x.Name, appId: x.AppID })),
          );
        } catch {
          resolve([]);
        }
      },
    );
  });
}

/** Is an app registered for this URI scheme? Windows: HKCR\\<scheme> with "URL Protocol";
 *  Linux: xdg-mime default handler; macOS: assume yes (Launch Services has no cheap query). */
export function uriHandlerExists(scheme: string): Promise<boolean> {
  if (!/^[a-z][a-z0-9+.-]*$/i.test(scheme)) return Promise.resolve(false);
  const run = (cmd: string, args: string[]): Promise<{ ok: boolean; out: string }> =>
    new Promise((resolve) =>
      execFile(cmd, args, { timeout: 5_000, windowsHide: true }, (err, stdout) =>
        resolve({ ok: !err, out: String(stdout) }),
      ),
    );
  if (process.platform === 'win32') {
    return run('reg.exe', ['query', `HKCR\\${scheme}`, '/v', 'URL Protocol']).then((r) => r.ok);
  }
  if (process.platform === 'linux') {
    return run('xdg-mime', ['query', 'default', `x-scheme-handler/${scheme}`]).then(
      (r) => r.ok && r.out.trim().length > 0,
    );
  }
  return Promise.resolve(true);
}

export const osDeps = (): Omit<ExecutorDeps, 'registry'> => ({
  platform: process.platform,
  env: process.env,
  fileExists: existsSync,
  spawnDetached,
  openExternal: (uri) => shell.openExternal(uri),
  listStartApps,
  uriHandlerExists,
});
