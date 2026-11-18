import { IPC } from '@shared/ipc';
import type { MainContext } from '../context';
import { handle } from './handle';

export function registerSettingsIpc(ctx: MainContext): void {
  handle(IPC.settings.get, () => ctx.settings.get());
  handle(IPC.settings.set, (patch) => {
    ctx.updateSettings(patch);
    return undefined;
  });
}
