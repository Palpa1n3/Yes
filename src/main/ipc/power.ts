import { notifyUser } from '../holo';
import { jobLocks } from '../services/job-locks';
/** Power: shut down, restart or sleep the PC (always with a delay that can be cancelled),
 *  and "do this when Steam finishes updating". Windows only. */
import { app, powerSaveBlocker } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IPC } from '@shared/ipc';
import type { DownloadStatus } from '@shared/gaming';
import { DownloadMode } from '../services/download-mode';
import { vdfValues } from '../services/installed-games';
import { emit, handle } from './handle';
import { execFile } from 'node:child_process';
import type { MainContext } from '../context';
import { progressText, steamUpdates, SteamWatch, type AfterAction } from '../services/steam-watch';
import { steamPath } from './games';

import { JourneyService, type TravelMode } from '../services/journey';
import { buildName, checkBuild, listWorlds, writeBuild } from '../services/minecraft-build';

export type PowerAction = 'shutdown' | 'restart' | 'sleep';

/** Shop names the user says → the site to open. */
const SHOP_SITES: Record<string, string> = {
  ebay: 'eBay (ebay.co.uk)',
  amazon: 'Amazon (amazon.co.uk)',
  vinted: 'Vinted (vinted.co.uk)',
  depop: 'Depop (depop.com)',
  facebook: 'Facebook Marketplace',
  'facebook marketplace': 'Facebook Marketplace',
  gumtree: 'Gumtree (gumtree.com)',
  cex: 'CeX (uk.webuy.com)',
};

/** Minutes from now until "HH:MM" (today, or tomorrow if it's passed), or the given minutes.
 *  null when neither is usable. */
export function minutesUntil(at: unknown, minutes: unknown, now = new Date()): number | null {
  if (typeof at === 'string') {
    const m = at.trim().match(/^([01]?\d|2[0-3])[:.]([0-5]\d)$/);
    if (!m) return null;
    const t = new Date(now);
    t.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (t.getTime() <= now.getTime() + 30_000) t.setDate(t.getDate() + 1);
    return Math.max(1, Math.round((t.getTime() - now.getTime()) / 60_000));
  }
  const n = Number(minutes);
  return n >= 1 && n <= 1440 ? n : null;
}

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
  download: DownloadMode;
} {
  let pending: {
    action: PowerAction;
    at: number;
    sleepTimer?: ReturnType<typeof setTimeout>;
  } | null = null;

  const tell = (text: string): void => {
    ctx.notify(text);
    ctx.command({ type: 'notice', text });
    notifyUser(ctx.settings.get().assistantName, text);
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
    // Anything of Alton's still running gets cut off: say what.
    const running = jobLocks.busy().map((b) => b.label);
    const warn = running.length
      ? ` Heads up: ${[...new Set(running)].join(', ')} ${running.length === 1 ? 'is' : 'are'} still running and will be cut off.`
      : '';
    return `${VERB[action]} in ${when}. Say “cancel shutdown” to stop it.${warn}`;
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

  const journeys = new JourneyService((url, init) => fetch(url, init));

  // ── Download mode ──
  const psOut = (script: string): Promise<string> =>
    new Promise((resolve) =>
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { windowsHide: true, timeout: 20_000 },
        (_err, out) => resolve(String(out ?? '')),
      ),
    );
  const safeName = (n: string): string => n.replace(/[^\w.-]/g, '');
  let blocker: number | null = null;
  const download = new DownloadMode({
    running: async () => {
      if (process.platform !== 'win32') return [];
      const out = await psOut('Get-Process | Select-Object Name, Path | ConvertTo-Json -Compress');
      try {
        const list = JSON.parse(out) as Array<{ Name?: string; Path?: string | null }>;
        return (Array.isArray(list) ? list : [list]).map((p) => ({
          name: String(p.Name ?? ''),
          path: p.Path ? String(p.Path) : null,
        }));
      } catch {
        return [];
      }
    },
    close: async (name) => {
      const n = safeName(name);
      // OneDrive has its own clean way to quit; others are asked to close, then stopped.
      const script =
        n.toLowerCase() === 'onedrive'
          ? "$p = Get-Process OneDrive -ErrorAction SilentlyContinue | Select-Object -First 1; if ($p) { Start-Process $p.Path '/shutdown'; 'ok' }"
          : `$p = Get-Process -Name '${n}' -ErrorAction SilentlyContinue; if ($p) { $p | ForEach-Object { [void]$_.CloseMainWindow() }; Start-Sleep -Seconds 3; Get-Process -Name '${n}' -ErrorAction SilentlyContinue | Stop-Process -Force; 'ok' }`;
      return (await psOut(script)).includes('ok');
    },
    reopen: async (path) => {
      const p = path.replace(/'/g, "''");
      const args = /onedrive\.exe$/i.test(path) ? " -ArgumentList '/background'" : '';
      await psOut(`Start-Process -FilePath '${p}'${args} -WindowStyle Minimized`);
    },
    steamPriority: async (high) =>
      process.platform === 'win32' &&
      (
        await psOut(
          `$p = Get-Process steam -ErrorAction SilentlyContinue; if ($p) { $p | ForEach-Object { $_.PriorityClass = '${high ? 'High' : 'Normal'}' }; 'ok' }`,
        )
      ).includes('ok'),
    keepAwake: (on) => {
      if (on && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension');
      if (!on && blocker !== null) {
        powerSaveBlocker.stop(blocker);
        blocker = null;
      }
    },
    steam: async () => {
      const sp = process.platform === 'win32' ? await steamPath() : null;
      return sp ? steamUpdates(sp) : null;
    },
    steamLimit: async () => {
      const sp = process.platform === 'win32' ? await steamPath() : null;
      const f = sp ? join(sp, 'config', 'config.vdf') : '';
      if (!f || !existsSync(f)) return 0;
      return Number(vdfValues(readFileSync(f, 'utf8'), 'DownloadThrottleKbps')[0]) || 0;
    },
    onChange: (st) => emit(ctx.getWindow(), IPC.gaming.onDownload, st),
    finished: (names, then) => {
      const what =
        names.length === 0 ? 'Steam' : names.length === 1 ? names[0] : `${names.length} games`;
      ctx.audit.add('action', `Download mode finished: ${what}`);
      if (then === 'none')
        return tell(`Download mode: ${what} finished downloading. Everything's back to normal.`);
      void schedule(then, 120, `Steam finished downloading ${what}.`).then((m) =>
        tell(`${what} finished downloading. ${m}`),
      );
    },
  });
  handle(IPC.gaming.download, async (on, then) => {
    const t: DownloadStatus['then'] = then === 'shutdown' || then === 'sleep' ? then : 'none';
    if (!on) return download.stop();
    const r = await download.start(t);
    if (!('error' in r))
      ctx.audit.add('action', `Download mode on${t !== 'none' ? ` (then ${t})` : ''}`);
    return r;
  });
  handle(IPC.gaming.downloadStatus, () => download.get());
  // Quitting puts things back (reopens apps, normal priority).
  app.on('before-quit', () => void download.stop());

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
    download,
    tools: {
      minecraft_build: async (input) => {
        const o = (input ?? {}) as Record<string, unknown>;
        const saves = join(process.env['APPDATA'] ?? app.getPath('appData'), '.minecraft', 'saves');
        const worlds = listWorlds(saves);
        if (!worlds.length)
          return {
            error: 'No Minecraft Java worlds found (looked in %APPDATA%\\.minecraft\\saves).',
          };
        if (o['action'] === 'list') return { worlds: worlds.slice(0, 20) };
        const want = typeof o['world'] === 'string' ? o['world'].trim().toLowerCase() : '';
        const world = want ? worlds.find((w) => w.toLowerCase().includes(want)) : worlds[0];
        if (!world)
          return {
            error: `No world called “${String(o['world'])}”. Worlds: ${worlds.slice(0, 10).join(', ')}`,
          };
        const c = checkBuild(o['commands']);
        if (!c.ok) return { error: c.error };
        const name = buildName(typeof o['name'] === 'string' ? o['name'] : 'build');
        const cmd = writeBuild(join(saves, world), name, c.lines, String(o['description'] ?? ''));
        ctx.audit.add(
          'action',
          `Minecraft build “${name}” saved to ${world} (${c.lines.length} commands)`,
        );
        return `Saved “${name}” (${c.lines.length} commands) into the world “${world}”. In Minecraft: type /reload, stand where you want it, then ${cmd}. Cheats/op are needed; build on open ground (it replaces blocks in the way and can't be undone, so try it in a copy of the world first if unsure).`;
      },
      journey_time: async (input) => {
        const o = (input ?? {}) as Record<string, unknown>;
        const s = ctx.settings.get();
        const to = typeof o['to'] === 'string' ? o['to'] : '';
        const fromText = typeof o['from'] === 'string' && o['from'].trim() ? o['from'] : '';
        const mode: TravelMode =
          o['mode'] === 'walking' || o['mode'] === 'cycling' ? o['mode'] : 'driving';
        const from = fromText
          ? await journeys.find(fromText)
          : s.homeAddress
            ? await journeys.find(s.homeAddress)
            : s.weatherPlace
              ? { lat: s.weatherPlace.lat, lon: s.weatherPlace.lon, name: s.weatherPlace.name }
              : null;
        if (!from)
          return {
            error:
              "I don't know where home is: ask for their address or postcode, or set it in Settings › General › Home address.",
          };
        const dest = await journeys.find(to).catch(() => null);
        if (!dest)
          return { error: `Couldn't find “${to}” on the map. Try a fuller address or postcode.` };
        const j = await journeys.route(from, dest, mode).catch(() => null);
        if (!j) return { error: 'No route found between those places.' };
        const at =
          typeof o['arrive_by'] === 'string' ? minutesUntil(o['arrive_by'], undefined) : null;
        const leave =
          at !== null
            ? new Date(Date.now() + (at - j.allow) * 60_000).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : null;
        // Show the route as a little glowing map in the chat.
        ctx.command({
          type: 'journey-map',
          map: {
            from: from.name,
            to: dest.name,
            minutes: j.minutes,
            allow: j.allow,
            km: j.km,
            mode,
            path: j.path ?? [
              [from.lon, from.lat],
              [dest.lon, dest.lat],
            ],
          },
        });
        return {
          from: from.name,
          to: dest.name,
          mode,
          minutes: j.minutes,
          km: j.km,
          allow_minutes: j.allow,
          ...(leave ? { leave_by: leave } : {}),
          note: mode === 'driving' ? 'No live traffic: allow_minutes adds a margin.' : undefined,
        };
      },
      shop: async (input) => {
        const o = (input ?? {}) as Record<string, unknown>;
        const str = (k: string, n = 600): string =>
          typeof o[k] === 'string' ? (o[k] as string).trim().slice(0, n) : '';
        const request = str('request');
        if (!request) return { error: 'Say what to look for.' };
        if (!ctx.settings.get().agentMode)
          return {
            error: 'Agent Mode is switched off (Settings › Smart features); shopping needs it.',
          };
        if (!ctx.startAgent) return { error: 'Agent Mode is not ready yet.' };
        const site =
          SHOP_SITES[str('site', 40).toLowerCase()] ?? (str('site', 80) || 'eBay (ebay.co.uk)');
        const goal = o['goal'] === 'offer' || o['goal'] === 'buy' ? o['goal'] : 'find';
        const max = Number(o['max_price']);
        const budget =
          max > 0 ? `£${max} including postage` : 'no set budget (ask before anything over £50)';
        const sellers = ctx.settings.get().permissions.message_sellers;
        const questions = str('seller_questions', 400);
        const task =
          o['check_messages'] === true
            ? `Open ${site} in the browser and go to its messages/inbox (you may need to be signed in already; if not, ask_user). Read new messages from sellers about ${request}. Report each reply (who, which item, what they said). ${sellers === 'allow' ? 'If a seller asked a simple question about the item, answer it briefly.' : ''} Don't make offers or agree prices without confirm_action.`
            : `Shopping task on ${site} (open it in the browser; if not signed in, ask_user). Looking for: ${request}. Budget: ${budget}. ` +
              (goal === 'find'
                ? 'Search, scroll through the results and compare. Report the best 3-5 options: name, total price incl. postage, condition, seller rating, and the link. Do not buy or make offers.'
                : goal === 'offer'
                  ? `Find the best match, then make an offer within the budget (confirm_action first with the item, seller and offer amount). If there's no offer option, report the Buy It Now price instead.`
                  : 'Find the best match within the budget, then buy it: confirm_action before Buy now / checkout, and again right before the final pay button with the total.') +
              (questions ? ` Ask the sellers of the best listings: ${questions}` : '');
        ctx.startAgent(task, { shopping: true, sellerMessages: sellers });
        ctx.audit.add('agent', `Shopping (${goal}) on ${site}: ${request}`);
        return `Agent Mode is ${o['check_messages'] === true ? 'checking seller messages' : `shopping on ${site}`} now. Offers and payments will ask for approval${sellers === 'allow' ? '; seller questions are sent without asking (Settings › Privacy › Permissions)' : ''}. Its report appears when it's done.`;
      },
      phone_messages: async (input) => {
        const o = (input ?? {}) as Record<string, unknown>;
        const who = typeof o['who'] === 'string' ? o['who'].trim().slice(0, 80) : '';
        const message = typeof o['message'] === 'string' ? o['message'].trim().slice(0, 1000) : '';
        if (!ctx.settings.get().agentMode)
          return {
            error:
              'Agent Mode is switched off (Settings › Smart features); reading phone messages needs it.',
          };
        if (!ctx.startAgent) return { error: 'Agent Mode is not ready yet.' };
        const open =
          'Open the Phone Link app (Start menu, search "Phone Link") and go to its Messages section. If Phone Link is not set up or the phone is not connected, stop and report exactly that.';
        let task: string;
        if (o['action'] === 'reply') {
          if (!who || !message) return { error: 'A reply needs "who" and "message".' };
          const ok = await ctx.askApproval?.(
            `Reply to ${who} by text?`,
            `“${message}”\n\nAgent Mode types it in Phone Link and asks again before pressing Send.`,
          );
          if (!ok) return 'The user said no; nothing was sent.';
          task = `${open} Open the conversation with ${who} (search for the name if it isn't in the list). Click the message box and type exactly this, nothing else: ${message}\nThen ask the user to confirm before pressing Send, and only send if they approve. Don't change or open anything else. Finish with agent_done saying whether it was sent.`;
        } else {
          task = `${open} ${who ? `Open the conversation with ${who} and read the latest messages in it.` : 'Read the newest conversations in the list (up to 8), opening any with unread messages.'} Only read: don't type, send, delete or open links or attachments. Finish with agent_done giving, for each conversation, who it's from, roughly when, and what they said (quote short messages, summarise long ones), newest first. Mention codes or anything that looks urgent first, but never read out one-time passcodes in full.`;
        }
        ctx.startAgent(task);
        ctx.audit.add(
          'agent',
          o['action'] === 'reply' ? `Replying to ${who} by text` : 'Checking phone messages',
        );
        return o['action'] === 'reply'
          ? `Agent Mode is typing the reply to ${who} in Phone Link; it will ask before sending.`
          : `Agent Mode is opening Phone Link to read ${who ? `${who}'s` : 'your'} messages; its report will appear when it's done (usually under a minute).`;
      },
      schedule_agent_task: async (input) => {
        const o = (input ?? {}) as Record<string, unknown>;
        const task = typeof o['task'] === 'string' ? o['task'].trim() : '';
        if (!task) return { error: 'Missing the task.' };
        const mins = minutesUntil(o['at'], o['minutes']);
        if (mins === null)
          return { error: 'Give "at" as HH:MM (24-hour) or "minutes" between 1 and 1440.' };
        if (!ctx.settings.get().agentMode)
          return {
            error:
              'Agent Mode is switched off (Settings › Smart features). Ask the user to turn it on first.',
          };
        const due = new Date(Date.now() + mins * 60_000);
        const when = due.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const ok = await ctx.askApproval?.(
          `At ${when}, let Agent Mode do this by itself?`,
          `${task}\n\nIt uses the mouse and keyboard, and still asks before anything risky. Leave the PC unlocked.`,
        );
        if (!ok) return 'The user said no; nothing was scheduled.';
        ctx.timers.add(mins, `Agent: ${task.slice(0, 80)}`, 'agent', task);
        ctx.audit.add('agent', `Scheduled for ${when}: ${task}`);
        return `Scheduled for ${when}. Agent Mode will start by itself then. The PC must be on and unlocked (a locked screen blocks the mouse and keyboard). Cancel it by cancelling the timer.`;
      },
      download_mode: async (input) => {
        const o = (input ?? {}) as Record<string, unknown>;
        if (o['on'] === false) {
          await download.stop();
          return 'Download mode is off; closed apps were reopened.';
        }
        const then: DownloadStatus['then'] =
          o['then'] === 'shutdown' || o['then'] === 'sleep' ? o['then'] : 'none';
        if (then !== 'none') {
          const ok = await ctx.askApproval?.(
            `${then === 'sleep' ? 'Sleep' : 'Shut down'} the PC when the downloads finish?`,
            'You get a 2-minute warning first, and can say “cancel shutdown”.',
          );
          if (!ok) return 'The user said no to shutting down; download mode was not started.';
        }
        const r = await download.start(then);
        if ('error' in r) return r;
        ctx.audit.add('action', `Download mode on${then !== 'none' ? ` (then ${then})` : ''}`);
        return {
          on: true,
          downloading: r.games.map((g) => `${g.name} (${g.progress})`),
          done: r.notes,
          note: r.games.length
            ? 'It ends by itself when Steam finishes.'
            : 'Nothing is downloading yet: it waits up to 10 minutes for Steam to start, then ends.',
          tips: 'For the most speed: a cable instead of Wi-Fi, and pause downloads on other devices at home.',
        };
      },
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
