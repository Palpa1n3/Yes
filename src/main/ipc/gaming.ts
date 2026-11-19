import { app } from 'electron';
import { execFile } from 'node:child_process';
import { toCommand, type CanonicalCommand, type CommandResult } from '@shared/commands';
import { IPC } from '@shared/ipc';
import type { MainContext } from '../context';
import { GamingMode, parsePowerScheme } from '../services/gaming';
import { ps } from '../services/system-actions';
import { GamingSessions, sessionLine } from '../services/gaming-sessions';
import { backupGameSaves, saveRoots } from '../services/save-backups';
import { join } from 'node:path';
import si from 'systeminformation';
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

  let lastStart = 0;
  let lastGame: string | null = null;
  const backupSaves = (game: string, since: number) =>
    Promise.resolve().then(() =>
      backupGameSaves({
        game,
        since,
        roots: saveRoots(app.getPath('home'), app.getPath('documents')),
        dest: join(app.getPath('userData'), 'save-backups'),
      }),
    );
  // Performance while gaming (sampled straight from the hardware: the HUD may be hidden).
  const sessions = new GamingSessions({
    file: join(app.getPath('userData'), 'gaming-sessions.json'),
    sample: async () => {
      const [load, temp, gfx, mem] = await Promise.all([
        si.currentLoad().catch(() => null),
        si.cpuTemperature().catch(() => null),
        si.graphics().catch(() => null),
        si.mem().catch(() => null),
      ]);
      const c =
        gfx?.controllers.find((g) => typeof g.utilizationGpu === 'number') ?? gfx?.controllers[0];
      return {
        cpu: load ? load.currentLoad : null,
        cpuTemp: temp && temp.main > 0 ? temp.main : null,
        gpu: typeof c?.utilizationGpu === 'number' ? c.utilizationGpu : null,
        gpuTemp:
          typeof c?.temperatureGpu === 'number' && c.temperatureGpu > 0 ? c.temperatureGpu : null,
        memPct: mem && mem.total ? ((mem.total - mem.available) / mem.total) * 100 : null,
      };
    },
  });
  ctx.gamingSessions = () => sessions.recent();
  app.on('will-quit', () => sessions.end());

  const gaming = new GamingMode({
    listProcesses: async () => {
      if (!win) return [];
      const { out } = await ps(PROCS, 15_000);
      const raw: unknown = JSON.parse(out || '[]');
      return (Array.isArray(raw) ? raw : [raw])
        .filter((x): x is { n: string; p: string | null } => !!x && typeof x.n === 'string')
        .map((x) => ({ name: x.n, path: typeof x.p === 'string' ? x.p : null }));
    },
    settings: (game) => {
      const s = ctx.settings.get();
      // Per-game profile (Settings › Gaming › Game profiles), matched by name.
      const g = (game ?? '').toLowerCase();
      const profile = g
        ? Object.entries(s.gamingProfiles).find(
            ([k]) => g.includes(k.toLowerCase()) || k.toLowerCase().includes(g),
          )?.[1]
        : undefined;
      return {
        enabled: s.gamingMode && win,
        powerPlan: (s.gamingPowerPlan || profile?.highPerformance === true) && win,
        closeApps: [...new Set([...s.gamingCloseApps, ...(profile?.closeApps ?? [])])],
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
    onChange: (st) => {
      emit(ctx.getWindow(), IPC.gaming.onChange, st);
      if (st.active) {
        sessions.start(st.game ?? 'Gaming');
        lastStart = Date.now();
        lastGame = st.game;
      } else {
        const started = lastStart;
        const game = lastGame;
        const done = sessions.end();
        if (ctx.settings.get().saveBackups && win && started)
          void backupSaves(game ?? 'Game', started).then((r) => {
            if (r) {
              ctx.audit.add('action', `Backed up ${r.files} save file(s) for ${r.game}`);
              ctx.notify(`Backed up ${r.files} save file(s) for ${r.game}.`);
            }
          });
        if (done) ctx.notify(`Gaming session: ${sessionLine(done)}`);
        if (done && !ctx.settings.get().gamingQuiet)
          ctx.command({ type: 'notice', text: `Gaming session: ${sessionLine(done)}` });
        else if (done) ctx.errors.add('info', 'gaming', sessionLine(done));
      }
    },
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
