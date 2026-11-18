import { app, net, Notification, safeStorage } from 'electron';
import { join } from 'node:path';
import { fmtTime, validCalendarUrl } from '@shared/calendar';
import { IPC } from '@shared/ipc';
import type { MainContext } from '../context';
import { CalendarService } from '../services/calendar';
import { SecretStore } from '../services/secret-store';
import { emit, handle } from './handle';

export function registerCalendarIpc(ctx: MainContext): CalendarService {
  // The private address works like a password, so it is stored encrypted.
  const secret = new SecretStore(join(app.getPath('userData'), 'calendar-url.bin'), safeStorage);
  const cal = new CalendarService({
    fetch: (url) => net.fetch(url),
    getUrl: () => secret.get(),
    hasUrl: () => secret.has(),
    file: join(app.getPath('userData'), 'calendar.json'),
    onChange: (s) => emit(ctx.getWindow(), IPC.calendar.onChange, s),
    remindMinutes: () => ctx.settings.get().calendarReminder || null,
    onReminder: (event, minutes) => {
      if (Notification.isSupported())
        new Notification({
          title: event.title,
          body: `${minutes <= 0 ? 'Starting now' : `In ${minutes} min`} · ${fmtTime(event.start)}${event.location ? ` · ${event.location}` : ''}`,
          silent: false,
        }).show();
      emit(ctx.getWindow(), IPC.calendar.onReminder, { event, minutes });
    },
  });

  handle(IPC.calendar.get, () => cal.state());
  handle(IPC.calendar.refresh, async () => {
    await cal.refresh();
    return cal.state();
  });
  handle(IPC.calendar.setUrl, async (raw) => {
    const url = validCalendarUrl(String(raw));
    if (!url)
      return {
        ok: false,
        message:
          'That isn’t a calendar address. Copy the “Secret address in iCal format” (it ends in .ics).',
      };
    try {
      const events = await cal.load(url);
      await secret.set(url);
      await cal.refresh();
      return {
        ok: true,
        message: `Connected. ${events.length} event${events.length === 1 ? '' : 's'} in the next two weeks.`,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'That calendar could not be read.',
      };
    }
  });
  handle(IPC.calendar.clearUrl, () => {
    secret.clear();
    cal.clear();
    return cal.state();
  });

  cal.start();
  app.on('will-quit', () => cal.stop());
  return cal;
}
