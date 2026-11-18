import { IPC } from '@shared/ipc';
import type { MainContext } from '../context';
import { handle, on } from './handle';

export function registerTimersIpc(ctx: MainContext): void {
  const { timers } = ctx;
  handle(IPC.timers.list, () => timers.list());
  handle(IPC.timers.add, (minutes, label) => {
    timers.add(Number(minutes), typeof label === 'string' ? label : '');
    return timers.list();
  });
  on(IPC.timers.cancel, (_w, id) => typeof id === 'string' && timers.cancel(id), ctx.getWindow);
  on(
    IPC.timers.snooze,
    (_w, id, minutes) => {
      const m = Number(minutes);
      if (typeof id === 'string' && m > 0 && m <= 120) timers.snooze(id, m);
    },
    ctx.getWindow,
  );
}
