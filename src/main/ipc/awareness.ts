import { app } from 'electron';
import { join } from 'node:path';
import { lookup } from 'node:dns/promises';
import si from 'systeminformation';
import type { MainContext } from '../context';
import { ForegroundWatch, isErrorWindow, type Foreground } from '../services/foreground-watch';
import { Habits } from '../services/habits';

/** The app in front, first-opens per day (habits) and app-triggered reminders. */
export function registerAwareness(ctx: MainContext): {
  foreground(): Foreground | null;
  habits: Habits;
  tools: Record<string, (input: unknown) => unknown>;
} {
  const watch = new ForegroundWatch();
  const habits = new Habits(join(app.getPath('userData'), 'habits.json'));
  watch.onChange((f, prev) => {
    if (f.app === prev?.app) return;
    for (const r of habits.seen(f.app)) {
      const text = `Reminder (you opened ${r.app}): ${r.text}`;
      ctx.notify(text);
      ctx.command({ type: 'notice', text: `⏰ ${text}` });
      ctx.audit.add('action', text);
    }
  });
  watch.start();
  app.on('will-quit', () => watch.stop());

  // Event-driven awareness: drives plugged in / removed, internet down / back.
  const say = (text: string): void => {
    if (!ctx.settings.get().healthAlerts || ctx.timers.focusing()) return;
    ctx.notify(text);
    ctx.command({ type: 'notice', text });
  };
  let drives: Map<string, string> | null = null;
  let online: boolean | null = null;
  let offlineSince = 0;
  let announcedDown = false;
  const poll = async (): Promise<void> => {
    const list = await si.blockDevices().catch(() => null);
    if (list) {
      const now = new Map(
        list
          .filter((d) => d.removable && d.mount)
          .map((d) => [
            d.mount,
            `${d.label || d.model || 'USB drive'} (${d.mount}${d.size ? `, ${Math.round(d.size / 1024 ** 3)} GB` : ''})`,
          ]),
      );
      if (drives) {
        for (const [m, label] of now) if (!drives.has(m)) say(`🔌 ${label} plugged in.`);
        for (const [m, label] of drives) if (!now.has(m)) say(`⏏ ${label} removed.`);
      }
      drives = now;
    }
    const ok = await lookup('www.msftconnecttest.com').then(
      () => true,
      () => false,
    );
    if (!ok && online !== false) offlineSince = Date.now();
    // Only mention an outage once it has lasted a minute, and the return only after one.
    if (!ok && !announcedDown && offlineSince && Date.now() - offlineSince >= 55_000) {
      announcedDown = true;
      say("🌐 The internet connection has dropped. I'll let you know when it's back.");
    }
    if (ok && online === false && announcedDown)
      say(
        `🌐 Internet is back (it was down for about ${Math.max(1, Math.round((Date.now() - offlineSince) / 60_000))} min).`,
      );
    if (ok) announcedDown = false;
    online = ok;
  };
  const timer = setInterval(() => void poll(), 30_000);
  void poll();
  app.on('will-quit', () => clearInterval(timer));

  return {
    foreground: () => watch.get(),
    habits,
    tools: {
      remind_when_app_opens: (input) => {
        const o = (input && typeof input === 'object' ? input : {}) as {
          app?: unknown;
          text?: unknown;
        };
        const appName = String(o.app ?? '').trim();
        const text = String(o.text ?? '').trim();
        if (!appName || !text) return { error: 'Need "app" and "text".' };
        if (process.platform !== 'win32') return { error: 'App reminders need Windows.' };
        const r = habits.addReminder(appName, text);
        return { set: `Next time ${r.app} is opened I'll remind: ${r.text}` };
      },
      list_app_reminders: () => {
        const list = habits.listReminders();
        return list.length ? list.map((r) => ({ app: r.app, text: r.text })) : { reminders: [] };
      },
      cancel_app_reminder: (input) => {
        const m = String((input as { match?: unknown } | null)?.match ?? '');
        const n = m ? habits.cancelReminder(m) : 0;
        return n ? { cancelled: n } : { error: 'No app reminder matches that.' };
      },
    },
  };
}

/** One line of context for Claude about what the user is doing. */
export function contextLine(f: Foreground | null): string {
  if (!f || !f.app) return '';
  const title = f.title && f.title !== f.app ? ` (window: “${f.title.slice(0, 80)}”)` : '';
  return `Right now the user's active app is ${f.app}${title}${f.fullscreen ? ', full screen' : ''}${isErrorWindow(f) ? '; it looks like an error pop-up' : ''}. Use this only if relevant.`;
}
