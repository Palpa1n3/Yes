import { IPC } from '@shared/ipc';
import type { MainContext } from '../context';
import { handle, on } from './handle';

export function registerWindowIpc(ctx: MainContext): void {
  const { getWindow } = ctx;
  on(IPC.window.minimize, (win) => win?.minimize(), getWindow);
  on(
    IPC.window.toggleMaximize,
    (win) => {
      if (!win || ctx.compact.isCompact) return;
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    },
    getWindow,
  );
  on(IPC.window.close, (win) => win?.close(), getWindow);
  on(
    IPC.window.setAlwaysOnTop,
    (_w, value) => ctx.updateSettings({ alwaysOnTop: Boolean(value) }),
    getWindow,
  );
  on(IPC.window.setCompact, (_w, value) => ctx.setCompact(Boolean(value)), getWindow);

  handle(IPC.window.getState, () => ({
    maximized: getWindow()?.isMaximized() ?? false,
    compact: ctx.compact.isCompact,
  }));
}
