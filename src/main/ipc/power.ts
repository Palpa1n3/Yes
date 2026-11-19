/** Power: shut down, restart or sleep the PC (always with a delay that can be cancelled),
 *  and "do this when Steam finishes updating". Windows only. */
import { Notification } from 'electron';
import { execFile } from 'node:child_process';
import type { MainContext } from '../context';
import { progressText, steamUpdates, SteamWatch, type AfterAction } from '../services/steam-watch';
import { steamPath } from './games';

export type PowerAction = 'shutdown' | 'restart' | 'sleep';

const run = (cmd: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) =>
    execFile(cmd, args, { windowsHide: true, timeout: 20_000 }, (err) =>
      err ? reject(err) : resolve(),
    ),
  );

const VERB: Record<PowerAction, string> = {
  shutdown: 'Shutting down',
  restart: 'Restarting',
  sleep: 'Going to sleep',
};

export function registerPower(ctx: MainContext): {
  tools: Record<string, (input: unknown) => Promise<unknown>>;
  /** For the phone companion (the tap on the phone is the confirmation). */
  schedule(action: PowerAction, seconds: number, why: string): Promise<string>;
  cancel(): Promise<string>;
} {
  let pending: {
    action: PowerAction;
    at: number;
    sleepTimer?: ReturnType<typeof setTimeout>;
  } | null = null;

  const tell = (text: string): void => {
    ctx.notify(text);
    ctx.command({ type: 'notice', text });
    if (Notification.isSupported())
      new Notification({ title: ctx.settings.get().assistantName, body: text }).show();
  };

  const schedule = async (action: PowerAction, seconds: number, why: string): Promise<string> => {
    if (process.platform !== 'win32') return 'Turning the PC off only works on Windows.';
    const secs = Math.max(30, Math.min(4 * 3600, Math.round(seconds)));
    await cancelQuiet();
    const msg = `${ctx.settings.get().assistantName}: ${why}`.slice(0, 500);
    if (action === 'sleep') {
      pending = {
        action,
        at: Date.now() + secs * 1000,
        sleepTimer: setTimeout(() => {
          pending = null;
          void run('powershell.exe', [
            '-NoProfile',
            '-Command',
            "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false) | Out-Null",
          ]).catch(() => undefined);
        }, secs * 1000),
      };
    } else {
      await run('shutdown.exe', [
        action === 'restart' ? '/r' : '/s',
        '/t',
        String(secs),
        '/c',
        msg,
      ]);
      pending = { action, at: Date.now() + secs * 1000 };
    }
    const when = secs >= 120 ? `${Math.round(secs / 60)} minutes` : `${secs} seconds`;
    ctx.audit.add('action', `${VERB[action]} in ${when}: ${why}`);
    return `${VERB[action]} in ${when}. Say “cancel shutdown” to stop it.`;
  };

  const cancelQuiet = async (): Promise<boolean> => {
    const had = !!pending;
    if (pending?.sleepTimer) clearTimeout(pending.sleepTimer);
    if (pending && pending.action !== 'sleep' && process.platform === 'win32')
      await run('shutdown.exe', ['/a']).catch(() => undefined);
    pending = null;
    return had;
  };

  const watch = new SteamWatch({
    read: async () => {
      const sp = process.platform === 'win32' ? await steamPath() : null;
      return sp ? steamUpdates(sp) : null;
    },
    done: (names, action) => {
      const what = names.length === 1 ? names[0] : `${names.length} games`;
      if (action === 'notify') return tell(`Steam has finished updating ${what}.`);
      void schedule(action, 120, `Steam finished updating ${what}.`).then((m) =>
        tell(`Steam finished updating ${what}. ${m}`),
      );
    },
  });

  const cancel = async (): Promise<string> => {
    const a = await cancelQuiet();
    const b = watch.cancel();
    if (a || b) ctx.audit.add('action', 'Cancelled the planned shutdown/sleep');
    return a || b ? 'Cancelled. The PC will stay on.' : 'Nothing was planned.';
  };

  const str = (input: unknown, k: string): string => {
    const v = (input as Record<string, unknown> | null)?.[k];
    return typeof v === 'string' ? v.trim() : '';
  };

  return {
    schedule,
    cancel,
    tools: {
      power_pc: async (input) => {
        const action = str(input, 'action');
        if (action === 'cancel') return cancel();
        if (action !== 'shutdown' && action !== 'restart' && action !== 'sleep')
          return { error: 'action must be shutdown, restart, sleep or cancel.' };
        const mins = Number((input as Record<string, unknown> | null)?.['minutes']);
        const secs = mins > 0 ? mins * 60 : 60;
        const label =
          action === 'shutdown' ? 'Shut down' : action === 'restart' ? 'Restart' : 'Sleep';
        const ok = await ctx.askApproval?.(
          `${label} the PC${secs > 60 ? ` in ${Math.round(secs / 60)} minutes` : ''}?`,
          'Save your work first. You can still cancel during the countdown.',
        );
        if (!ok) return 'The user said no; the PC stays on.';
        return schedule(action, secs, str(input, 'reason') || 'asked to by you');
      },
      steam_downloads: async () => {
        const sp = process.platform === 'win32' ? await steamPath() : null;
        if (!sp) return { error: 'Steam isn’t installed on this PC.' };
        const apps = steamUpdates(sp);
        const w = watch.status();
        return {
          downloading: apps.filter((a) => a.active).map((a) => `${a.name} (${progressText(a)})`),
          waiting: apps.filter((a) => !a.active).map((a) => a.name),
          ...(w ? { watching: `${w.action} after: ${w.games.join(', ')}` } : {}),
          ...(pending
            ? { planned: `${pending.action} at ${new Date(pending.at).toLocaleTimeString()}` }
            : {}),
        };
      },
      when_steam_updates_finish: async (input) => {
        const a = str(input, 'action');
        const action: AfterAction = a === 'sleep' || a === 'notify' ? a : 'shutdown';
        const game = str(input, 'game');
        if (action !== 'notify') {
          const ok = await ctx.askApproval?.(
            `${action === 'sleep' ? 'Sleep' : 'Shut down'} the PC when Steam finishes updating${game ? ` ${game}` : ''}?`,
            'You get a 2-minute warning first, and can say “cancel shutdown” any time.',
          );
          if (!ok) return 'The user said no.';
        }
        const r = await watch.arm(action, game);
        if (!r.ok) return { error: r.reason };
        ctx.audit.add('action', `Waiting for Steam (${r.games.join(', ')}) then: ${action}`);
        return `Watching ${r.games.join(', ')}. When ${r.games.length > 1 ? 'they finish' : 'it finishes'}, ${action === 'notify' ? 'I’ll tell the user' : `there's a 2-minute warning, then the PC will ${action === 'sleep' ? 'sleep' : 'shut down'}`}.`;
      },
    },
  };
}
