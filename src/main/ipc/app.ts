import { app, dialog, shell } from 'electron';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { IPC, type OpenTarget } from '@shared/ipc';
import type { MainContext } from '../context';
import { handle, on } from './handle';
import { DataBackup } from '../services/data-backup';

export function registerAppIpc(ctx: MainContext): void {
  const userData = app.getPath('userData');

  handle(IPC.app.getInfo, () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    userDataPath: userData,
    activeHotkey: ctx.hotkey.active,
    activeVoiceHotkey: ctx.voiceHotkey.active,
    activeOpenMicHotkey: ctx.openMicHotkey.active,
    activeClipboardHotkey: ctx.clipboardHotkey.active,
  }));

  // Only ARC's own locations: the renderer can't ask main to open arbitrary paths.
  const PATHS: Record<OpenTarget, string> = {
    userData,
    appsJson: join(userData, 'apps.json'),
    settingsJson: join(userData, 'settings.json'),
    logs: join(userData, 'logs'),
    backups: join(userData, 'backups'),
    saveBackups: join(userData, 'save-backups'),
    plugins: join(userData, 'plugins'),
  };
  on(
    IPC.app.openPath,
    (_w, target) => {
      const p = PATHS[target];
      if (p) {
        mkdirSync(p, { recursive: true });
        void shell.openPath(p);
      }
    },
    ctx.getWindow,
  );

  handle(IPC.app.resetSettings, () => ctx.settings.reset());
  handle(IPC.app.logs, () => ctx.errors.tail(200));
  handle(IPC.app.history, () => ctx.audit.list());
  // Daily backups of Alton's own data, checked at start and every few hours.
  const backups = new DataBackup(userData);
  const daily = (): void => {
    try {
      const b = backups.daily();
      if (b) ctx.errors.add('info', 'backup', `Backed up Alton's data (${b.name})`);
    } catch (err) {
      ctx.errors.add(
        'warn',
        'backup',
        `Backup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };
  setTimeout(daily, 60_000);
  setInterval(daily, 4 * 3600_000).unref?.();
  handle(IPC.app.backups, () => backups.list());
  handle(IPC.app.backupNow, () => {
    backups.backup();
    return backups.list();
  });
  handle(IPC.app.restore, (name) => {
    const ok = backups.restore(String(name));
    if (ok) {
      ctx.audit.add('action', `Restored Alton's data from the ${String(name)} backup`);
      setTimeout(() => {
        app.relaunch();
        ctx.quit();
      }, 300);
    }
    return ok;
  });
  handle(IPC.app.clearHistory, () => {
    ctx.audit.clear();
    return ctx.audit.list();
  });
  handle(IPC.app.pickSourceDir, async () => {
    const win = ctx.getWindow();
    const opts = {
      title: "Choose ARC's project folder (the one with package.json)",
      properties: ['openDirectory' as const],
    };
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    const dir = r.canceled ? '' : (r.filePaths[0] ?? '');
    if (!dir || !existsSync(join(dir, 'package.json'))) return '';
    ctx.updateSettings({ sourceDir: dir });
    return dir;
  });
}
