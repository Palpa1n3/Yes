import { app } from 'electron';
import { execFile } from 'node:child_process';
import { toCommand, type CanonicalCommand, type CommandResult } from '@shared/commands';
import { IPC } from '@shared/ipc';
import type { MainContext } from '../context';
import { GamingMode, parsePowerScheme } from '../services/gaming';
import { ps } from '../services/system-actions';
import { emit, handle } from './handle';

const PROCS =
  '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Process | ForEach-Object { $p = $null; try { $p = $_.Path } catch {}; [pscustomobject]@{n=$_.ProcessName; p=$p} } | ConvertTo-Json -Compress';

const powercfg = (args: string[]): Promise<{ ok: boolean; out: string }> =>
  new Promise((resolve) =>
    execFile('powercfg.exe', args, { windowsHide: true, timeout: 10_000 }, (err, out) =>
      resolve({ ok: !err, out: String(out) }),
    ),
  );

export function registerGamingIpc(
  ctx: MainContext,
  execute: (cmd: CanonicalCommand) => Promise<CommandResult>,
): GamingMode {
  const win = process.platform === 'win32';
  const run = async (action: string, target: string): Promise<boolean> =>
    (await execute(toCommand({ action, target }, `gaming-${Date.now()}`))).status === 'success';

  const gaming = new GamingMode({
    listProcesses: async () => {
      if (!win) return [];
      const { out } = await ps(PROCS, 15_000);
      const raw: unknown = JSON.parse(out || '[]');
      return (Array.isArray(raw) ? raw : [raw])
        .filter((x): x is { n: string; p: string | null } => !!x && typeof x.n === 'string')
        .map((x) => ({ name: x.n, path: typeof x.p === 'string' ? x.p : null }));
    },
    settings: () => {
      const s = ctx.settings.get();
      return {
        enabled: s.gamingMode && win,
        powerPlan: s.gamingPowerPlan && win,
        closeApps: s.gamingCloseApps,
        extraGames: s.gamingGames,
      };
    },
    getPowerPlan: async () =>
      win ? parsePowerScheme((await powercfg(['/getactivescheme'])).out) : null,
    // SCHEME_MIN is Windows' alias for the High performance plan.
    setPowerPlan: async (plan) =>
      win ? (await powercfg(['/setactive', plan === 'high' ? 'SCHEME_MIN' : plan])).ok : false,
    closeApp: (name) => run('close_app', name),
    launchApp: (name) => run('launch_app', name),
    onChange: (st) => emit(ctx.getWindow(), IPC.gaming.onChange, st),
  });

  handle(IPC.gaming.status, () => gaming.get());
  handle(IPC.gaming.start, async () => {
    await gaming.start();
    return gaming.get();
  });
  handle(IPC.gaming.stop, async () => {
    await gaming.stop();
    return gaming.get();
  });
  gaming.startWatching();
  app.on('will-quit', () => void gaming.dispose());
  return gaming;
}
