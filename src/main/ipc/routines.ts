import { phoneMessages } from '../services/phone-messages';
import { groupMessages, quickSummary } from '@shared/messages';
import { app } from 'electron';
import { join } from 'node:path';
import type { CanonicalCommand, CommandResult } from '@shared/commands';
import { IPC } from '@shared/ipc';
import { buildBriefing, findRoutine } from '@shared/routines';
import type { MainContext } from '../context';
import { RoutineService } from '../services/routine-service';
import type { WeatherService } from '../services/weather';
import type { CalendarService } from '../services/calendar';
import type { NotesStore } from '../services/notes-store';
import { todoSentence } from '@shared/notes';
import { emit, handle, on } from './handle';

export function registerRoutinesIpc(
  ctx: MainContext,
  execute: (cmd: CanonicalCommand) => Promise<CommandResult>,
  weather: WeatherService,
  calendar: CalendarService,
  notes: NotesStore,
  emailLine: () => string | null = () => null,
): { service: RoutineService; run(cmd: CanonicalCommand): Promise<CommandResult> } {
  const service = new RoutineService({
    file: join(app.getPath('userData'), 'routines.json'),
    execute,
    briefing: () => {
      const s = ctx.settings.get();
      const msgs = phoneMessages()?.since(Date.now() - 12 * 3_600_000) ?? [];
      const msgLine = msgs.length ? ` Phone messages: ${quickSummary(groupMessages(msgs))}` : '';
      return `${buildBriefing({
        now: Date.now(),
        personality: s.personality,
        userName: s.userName,
        weather: weather.get().data,
        weatherConfigured: s.weatherPlace !== null,
        timers: ctx.timers.list(),
        stats: ctx.telemetry.snapshot(),
        calendar: calendar.state().configured ? calendar.state().events : null,
        todo: todoSentence(notes.state()),
        email: emailLine(),
      })}${msgLine}`;
    },
    onChange: (list) => emit(ctx.getWindow(), IPC.routines.onChange, list),
    onProgress: (p) => emit(ctx.getWindow(), IPC.routines.onProgress, p),
  });
  service.load();

  // Timed routines: checked every 20 s; the renderer runs them as normal routine cards.
  const fired = new Set<string>();
  setInterval(() => {
    const minute = Math.floor(Date.now() / 60_000);
    for (const r of service.dueNow()) {
      const key = `${r.id}@${minute}`;
      if (fired.has(key)) continue;
      fired.add(key);
      ctx.command({ type: 'run-routine', id: r.id });
    }
    if (fired.size > 200) fired.clear();
  }, 20_000).unref();

  // Startup routines are handed out once per launch, so a renderer reload doesn't repeat them.
  let startupServed = false;
  handle(IPC.routines.list, () => service.list());
  handle(IPC.routines.save, (r) => service.upsert(r));
  handle(IPC.routines.remove, (id) => service.remove(String(id)));
  handle(IPC.routines.startup, () => {
    if (startupServed) return [];
    startupServed = true;
    return service.dueAtStartup();
  });
  on(IPC.routines.stop, () => service.stop(), ctx.getWindow);

  /** The run_routine command: target is a routine id (from ARC's UI) or a name (from Claude). */
  const run = async (cmd: CanonicalCommand): Promise<CommandResult> => {
    const list = service.list();
    const t = cmd.target?.trim() ?? '';
    const r = list.find((x) => x.id === t) ?? findRoutine(t, list);
    if (!r)
      return {
        commandId: cmd.id,
        status: 'failed',
        message: list.length
          ? `No routine called “${t}”. You have: ${list.map((x) => x.name).join(', ')}.`
          : 'You have no routines yet. Make one in the Routines tab.',
        timestamp: Date.now(),
      };
    return service.run(r.id, cmd.id);
  };
  return { service, run };
}
