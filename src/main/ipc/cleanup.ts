import { app, shell } from 'electron';
import { spawn } from 'node:child_process';
import { CLEANUP_INFO, type CleanupId } from '@shared/cleanup';
import { IPC } from '@shared/ipc';
import type { MainContext } from '../context';
import { Cleanup } from '../services/cleanup';
import { ps } from '../services/system-actions';
import { handle, on } from './handle';

const RECYCLE_SIZE =
  "$s=0; (New-Object -ComObject Shell.Application).NameSpace(10).Items() | ForEach-Object { $v = $_.ExtendedProperty('System.Size'); if ($v) { $s += [int64]$v } }; $s";

export function registerCleanupIpc(ctx: MainContext): void {
  const win = process.platform === 'win32';
  const cleanup = new Cleanup({
    env: {
      temp: app.getPath('temp'),
      downloads: app.getPath('downloads'),
      localAppData: process.env['LOCALAPPDATA'],
      appData: process.env['APPDATA'],
    },
    ...(win
      ? {
          recycleSize: async () => Number((await ps(RECYCLE_SIZE, 30_000)).out.trim()) || 0,
          emptyRecycleBin: async () =>
            (await ps('Clear-RecycleBin -Force -ErrorAction SilentlyContinue; exit 0', 60_000))
              .code === 0,
        }
      : {}),
    trash: (p) => shell.trashItem(p),
  });

  let scanning: ReturnType<Cleanup['scan']> | null = null;
  handle(IPC.cleanup.scan, () => {
    scanning ??= cleanup.scan().finally(() => {
      scanning = null;
    });
    return scanning;
  });
  handle(IPC.cleanup.run, (ids, names) =>
    cleanup.run(
      (Array.isArray(ids) ? ids : []).filter(
        (i): i is CleanupId => typeof i === 'string' && i in CLEANUP_INFO,
      ),
      (Array.isArray(names) ? names : []).filter((n): n is string => typeof n === 'string'),
    ),
  );
  // Windows' own tool for system files (Windows Update leftovers etc. need admin).
  on(
    IPC.cleanup.openWindowsTool,
    () => {
      if (win) spawn('cleanmgr.exe', [], { detached: true, stdio: 'ignore' }).unref();
    },
    ctx.getWindow,
  );
}
