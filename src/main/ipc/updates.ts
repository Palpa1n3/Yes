import { deskState } from '../desk-state';
import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { IPC } from '@shared/ipc';
import type { UpdateState } from '@shared/updates';
import type { MainContext } from '../context';
import { DataBackup } from '../services/data-backup';
import { bootGuard, rollBack } from '../services/rollback';
import { emit, handle } from './handle';

const FOUR_HOURS = 4 * 3600_000;

/** Checks GitHub Releases (repo set in electron-builder.yml), downloads in the background,
 *  installs when ARC restarts. Only for the installed app, not `npm run dev`. */
export function registerUpdatesIpc(ctx: MainContext): void {
  let state: UpdateState = {
    status: app.isPackaged ? 'idle' : 'dev',
    current: app.getVersion(),
    version: null,
    percent: null,
    error: null,
    checkedAt: null,
    previous: app.isPackaged ? bootGuard().previous() : null,
    skipped: null,
  };
  const set = (patch: Partial<UpdateState>): void => {
    state = { ...state, ...patch };
    deskState.update = state.status === 'downloading' ? (state.percent ?? 0) : null;
    emit(ctx.getWindow(), IPC.updates.onChange, state);
  };

  handle(IPC.updates.state, () => state);
  handle(IPC.updates.check, async () => {
    if (!app.isPackaged) return state;
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message.slice(0, 200) : 'Update check failed.',
      });
    }
    return state;
  });
  handle(IPC.updates.rollback, async () => {
    const target = bootGuard().previous();
    if (!app.isPackaged || !target)
      return { ok: false, message: 'There’s no earlier version to go back to.' };
    const r = await rollBack({
      userData: app.getPath('userData'),
      guard: bootGuard(),
      current: app.getVersion(),
      target,
      quit: ctx.quit,
    });
    ctx.audit.add('action', r.message, r.ok);
    return r;
  });
  handle(IPC.updates.install, () => {
    if (state.status !== 'ready') return false;
    // quitAndInstall triggers before-quit, so the window really closes (not to the tray).
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return true;
  });

  if (!app.isPackaged) return;
  // Downloads are started by hand below, so a version Alton rolled back from is never fetched.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;
  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: null }));
  autoUpdater.on('update-not-available', () => set({ status: 'none', checkedAt: Date.now() }));
  autoUpdater.on('update-available', (i) => {
    if (bootGuard().skipped().includes(i.version)) {
      set({ status: 'none', version: null, skipped: i.version, checkedAt: Date.now() });
      return;
    }
    bootGuard().clearSkipsBelow(i.version);
    set({
      status: 'downloading',
      version: i.version,
      percent: 0,
      skipped: null,
      checkedAt: Date.now(),
    });
    void autoUpdater.downloadUpdate().catch((err: unknown) =>
      set({
        status: 'error',
        error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
      }),
    );
  });
  autoUpdater.on('download-progress', (p) =>
    set({ status: 'downloading', percent: Math.round(p.percent) }),
  );
  autoUpdater.on('update-downloaded', (i) => {
    // A copy of Alton's data from just before this version, to go back to if it misbehaves.
    try {
      new DataBackup(app.getPath('userData')).backup(`before-update-${i.version}`);
    } catch {
      /* the daily backups still stand */
    }
    set({ status: 'ready', version: i.version, percent: 100 });
    ctx.command({
      type: 'notice',
      text: `Update ${i.version} is ready. It installs when ARC restarts (or press “Restart to update”).`,
    });
  });
  autoUpdater.on('error', (err) =>
    set({
      status: 'error',
      error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    }),
  );
  const check = (): void => void autoUpdater.checkForUpdates().catch(() => undefined);
  setTimeout(check, 30_000).unref?.();
  setInterval(check, FOUR_HOURS).unref?.();
}
