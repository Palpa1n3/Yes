import { app, shell } from 'electron';
import { join } from 'node:path';
import { IPC, type OpenTarget } from '@shared/ipc';
import type { MainContext } from '../context';
import { HistoryStore } from '../services/history-store';
import { handle, on } from './handle';

export function registerAppIpc(ctx: MainContext): void {
  const userData = app.getPath('userData');
  const history = new HistoryStore(join(userData, 'history.json'));

  handle(IPC.history.get, () => (ctx.settings.get().persistHistory ? history.load() : []));
  on(
    IPC.history.save,
    (_w, messages) => ctx.settings.get().persistHistory && history.save(messages),
    ctx.getWindow,
  );
  on(IPC.history.clear, () => history.clear(), ctx.getWindow);
  // Turning persistence off also forgets what was stored.
  ctx.settings.subscribe((next, prev) => {
    if (prev.persistHistory && !next.persistHistory) history.clear();
  });

  handle(IPC.app.getInfo, () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    userDataPath: userData,
    activeHotkey: ctx.hotkey.active,
  }));

  // Only ARC's own locations: the renderer can't ask main to open arbitrary paths.
  const PATHS: Record<OpenTarget, string> = {
    userData,
    appsJson: join(userData, 'apps.json'),
    settingsJson: join(userData, 'settings.json'),
  };
  on(
    IPC.app.openPath,
    (_w, target) => {
      const p = PATHS[target];
      if (p) void shell.openPath(p);
    },
    ctx.getWindow,
  );

  handle(IPC.app.resetSettings, () => ctx.settings.reset());
}
