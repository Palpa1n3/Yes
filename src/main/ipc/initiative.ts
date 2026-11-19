import { app, powerMonitor } from 'electron';
import { join } from 'node:path';
import si from 'systeminformation';
import { IPC } from '@shared/ipc';
import type { CalEvent } from '@shared/calendar';
import type { EmailSummary } from '@shared/email';
import type { Routine } from '@shared/routines';
import type { SystemStats } from '@shared/types';
import type { WeatherData } from '@shared/weather';
import type { MainContext } from '../context';
import { Initiative } from '../services/initiative';
import type { InitiativeInput } from '@shared/initiative';
import { emit } from './handle';

export function registerInitiativeIpc(
  ctx: MainContext,
  src: {
    events(): CalEvent[] | null;
    weather(): WeatherData | null;
    email(): EmailSummary[];
    routines(): Routine[];
    busy(): boolean;
    /** Foreground app, errors, habits, goals. */
    extra?(): Partial<InitiativeInput>;
  },
): Initiative {
  const engine = new Initiative({
    input: async () => {
      // Only pay for a process list when memory is actually tight.
      const mem = await si.mem().catch(() => null);
      let stats: SystemStats | null = null;
      if (mem && mem.total && (mem.total - mem.available) / mem.total >= 0.88) {
        const s = await ctx.telemetry.snapshotWithProcesses().catch(() => null);
        stats = s
          ? { ...s, memory: { ...s.memory, used: mem.total - mem.available, total: mem.total } }
          : null;
      }
      return {
        now: new Date(),
        stats,
        events: src.events(),
        weather: src.weather(),
        email: src.email(),
        routines: src.routines(),
        userName: ctx.settings.get().userName,
        ...(src.extra?.() ?? {}),
      };
    },
    enabled: () => ctx.settings.get().initiative,
    quietHours: () => {
      const s = ctx.settings.get();
      return { start: s.quietStart, end: s.quietEnd };
    },
    busy: src.busy,
    idleSec: () => powerMonitor.getSystemIdleTime(),
    emit: (s) => {
      ctx.audit.add('suggestion', s.text);
      ctx.notify(s.text);
      emit(ctx.getWindow(), IPC.initiative.onSuggest, s);
    },
    file: join(app.getPath('userData'), 'suggestions.json'),
  });
  engine.start();
  app.on('will-quit', () => engine.stop());
  return engine;
}
