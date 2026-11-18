import { IPC } from '@shared/ipc';
import type { MainContext } from '../context';
import { info } from '../services/system-stats';
import { handle, on } from './handle';

export function registerSystemIpc(ctx: MainContext): void {
  handle(IPC.system.getStats, () => ctx.telemetry.snapshot());
  handle(IPC.system.getInfo, () => info());
  on(IPC.system.setDetail, (_w, detail) => ctx.telemetry.setDetail(detail), ctx.getWindow);
}
