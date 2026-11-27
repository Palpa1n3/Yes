import { deskState } from '../desk-state';
import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { IPC } from '@shared/ipc';
import type { UpdateState } from '@shared/updates';
import type { MainContext } from '../context';
import { DataBackup } from '../services/data-backup';
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
  handle(IPC.updates.install, () => {
    if (state.status !== 'ready') return false;
    // quitAndInstall triggers before-quit, so the window really closes (not to the tray).
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return true;
  });

  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;
  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: null }));
  autoUpdater.on('update-not-available', () => set({ status: 'none', checkedAt: Date.now() }));
  autoUpdater.on('update-available', (i) =>
    set({ status: 'downloading', version: i.version, percent: 0, checkedAt: Date.now() }),
  );
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
