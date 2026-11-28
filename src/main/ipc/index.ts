import { phoneMessages, startPhoneMessages } from '../services/phone-messages';
import { lastPayday, phoneStatus } from '../services/phone-status';
import { buildCatchup } from '@shared/catchup';
import { inQuietHours } from '@shared/messages';
import { groupMessages, quickSummary } from '@shared/messages';
import { startDesk } from '../desk';
import { deskHooks } from '../desk-state';
import { notifyUser } from '../holo';
import { JourneyService, LeaveReminders } from '../services/journey';
import { app, shell, powerMonitor, screen } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MainContext } from '../context';
import { SkillRegistry, systemReportSkill } from '../services/skills';
import { toWebUrl } from '../services/command-executor';
import { registerAppIpc } from './app';
import { registerAssistantIpc } from './assistant';
import { registerCommandsIpc } from './commands';
import { registerInfoIpc } from './info';
import { registerRoutinesIpc } from './routines';
import { registerTimersIpc } from './timers';
import { registerWeatherIpc } from './weather';
import { registerCalendarIpc } from './calendar';
import { registerChatsIpc } from './chats';
import { registerNotesIpc } from './notes';
import { registerMediaIpc } from './media';
import { registerCleanupIpc } from './cleanup';
import { registerPreviewsIpc } from './previews';
import { registerScreenIpc } from './screen';
import { registerClipboardIpc, registerHealthIpc } from './clipHealth';
import { registerEmailIpc } from './email';
import { registerUpdatesIpc } from './updates';
import type { EmailService } from '../services/email';
import { emailSentence } from '@shared/email';
import { describeSchedule, describeStep, sanitizeRoutine, stepProblem } from '@shared/routines';
import { registerGamingIpc } from './gaming';
import { registerAgentIpc } from './agent';
import { registerInitiativeIpc } from './initiative';
import { registerRemoteIpc } from './remote';
import { registerApprovalIpc } from './approval';
import { contextLine, registerAwareness } from './awareness';
import { isErrorWindow } from '../services/foreground-watch';
import { agentBusy } from '@shared/agent';
import { registerVoiceIpc } from './voice';
import { describeNow } from '@shared/context';
import { senderName } from '@shared/email';
import { describeWeather, rainSoon } from '@shared/weather';
import { jobLocks } from '../services/job-locks';
import { registerSettingsIpc } from './settings';
import { registerSystemIpc } from './system';
import { registerWindowIpc } from './window';

/** Central registration: every channel group is wired here, once. */
export function registerIpc(ctx: MainContext): void {
  registerApprovalIpc(ctx);
  // Email is registered later; the briefing reads it through this.
  const emailRef: { current: EmailService | null } = { current: null };
  registerWindowIpc(ctx);
  registerSystemIpc(ctx);
  const weather = registerWeatherIpc(ctx);
  const skills = new SkillRegistry({
    settings: () => ctx.settings.get(),
    stats: () => ctx.telemetry.snapshot(),
    openUrl: async (url) => {
      const safe = toWebUrl(url);
      if (safe) await shell.openExternal(safe);
    },
    log: (m) => console.warn(`[arc] ${m}`),
  });
  skills.register(systemReportSkill);
  const commands = registerCommandsIpc(skills, ctx.timers, (cmd, r) => {
    // Read-only questions aren't actions worth listing.
    if (cmd.action === 'system_query') return;
    ctx.audit.add(
      cmd.action === 'run_routine' ? 'routine' : 'action',
      `${cmd.action.replace(/_/g, ' ')}${cmd.target ? `: ${cmd.target}` : ''}${cmd.args?.length ? ` (${cmd.args.join(', ')})` : ''} → ${r.message}`,
      r.status === 'success',
    );
  });
  const calendar = registerCalendarIpc(ctx);
  // "Leave by" heads-ups for calendar events with a location (journey from home).
  {
    const journeys = new JourneyService((url, init) => fetch(url, init));
    let homeKey = '';
    let home: { lat: number; lon: number; name: string } | null = null;
    const leave = new LeaveReminders({
      journeys,
      home: () => home,
      events: () => {
        const st = calendar.state();
        return st.configured ? st.events : null;
      },
      enabled: () => ctx.settings.get().leaveReminders,
      notify: (text) => {
        ctx.notify(text);
        ctx.command({ type: 'notice', text });
        notifyUser(`${ctx.settings.get().assistantName} · Time to leave`, text, 'warn');
      },
    });
    const tick = async (): Promise<void> => {
      const s = ctx.settings.get();
      const key =
        s.homeAddress || (s.weatherPlace ? `${s.weatherPlace.lat},${s.weatherPlace.lon}` : '');
      if (key !== homeKey) {
        homeKey = key;
        home = s.homeAddress
          ? await journeys.find(s.homeAddress).catch(() => null)
          : s.weatherPlace
            ? { lat: s.weatherPlace.lat, lon: s.weatherPlace.lon, name: s.weatherPlace.name }
            : null;
      }
      await leave.tick().catch(() => undefined);
    };
    const t = setInterval(() => void tick(), 5 * 60_000);
    t.unref?.();
    setTimeout(() => void tick(), 60_000);
  }
  const notes = registerNotesIpc(ctx);
  const media = registerMediaIpc(ctx);
  registerCleanupIpc(ctx);
  registerPreviewsIpc();
  const routines = registerRoutinesIpc(ctx, commands.execute, weather, calendar, notes, () =>
    emailRef.current ? emailSentence(emailRef.current.get()) : null,
  );
  commands.setRoutineRunner(routines.run);
  const gaming = registerGamingIpc(ctx, commands.execute);
  const screenWatch = registerScreenIpc(ctx, () => gaming.get().active);
  const clips = registerClipboardIpc(ctx);
  const email = registerEmailIpc(ctx);
  emailRef.current = email;
  registerHealthIpc(ctx);
  const chats = registerChatsIpc(ctx);
  const awareness = registerAwareness(ctx);
  // Screensaver: after the chosen idle time, Alton goes full-screen with a clock (not while
  // something full-screen is in front, music/video is playing, or in gaming mode).
  {
    let active = false;
    let wasVisible = true;
    /** "Alton isn't being used": when the user last used Alton's window (ms). */
    let lastAltonUse = Date.now();
    const cursorOnAlton = (w: Electron.BrowserWindow): boolean =>
      screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id ===
      screen.getDisplayMatching(w.getBounds()).id;
    const tick = (): void => {
      const s = ctx.settings.get();
      const w = ctx.getWindow();
      if (!w || w.isDestroyed()) return;
      const idle = powerMonitor.getSystemIdleTime();
      // While Alton is the window in front, any recent input counts as using it.
      if (!active && w.isFocused()) lastAltonUse = Math.max(lastAltonUse, Date.now() - idle * 1000);
      if (active) {
        // Alton mode on its own screen: only input on that screen (or focusing Alton) ends it.
        const backOnAlton = s.screensaverWhen !== 'alton' || cursorOnAlton(w) || w.isFocused();
        if (idle < 3 && backOnAlton) {
          lastAltonUse = Date.now();
          active = false;
          w.setFullScreen(false);
          if (!wasVisible) w.hide();
          ctx.command({ type: 'screensaver', on: false });
        }
        return;
      }
      if (!s.screensaverMinutes) return;
      const wait = s.screensaverMinutes * 60;
      if (s.screensaverWhen === 'alton') {
        // Not used for long enough, on screen (not minimised or in the tray)…
        if (Date.now() - lastAltonUse < wait * 1000) return;
        if (!w.isVisible() || w.isMinimized()) return;
        // …and it won't cover your work: Alton is in front, or you're working on another screen.
        const elsewhere = !cursorOnAlton(w);
        if (!w.isFocused() && !elsewhere) return;
        if (w.isFocused() && idle < wait) return;
        if (!elsewhere && awareness.foreground()?.fullscreen) return;
      } else if (idle < wait) return;
      else if (awareness.foreground()?.fullscreen) return;
      if (media.get()?.playing) return;
      if (s.gamingMode && gaming.get().active) return;
      active = true;
      wasVisible = w.isVisible();
      w.showInactive();
      w.setFullScreen(true);
      ctx.command({ type: 'screensaver', on: true });
    };
    const t = setInterval(tick, 3000);
    t.unref?.();
  }
  const nowContext = (): string => {
    const now = Date.now();
    const g = gaming.get();
    const cal = calendar.state();
    const next = cal.configured
      ? (cal.events
          .filter((e) => !e.allDay && e.start > now)
          .sort((a, b) => a.start - b.start)[0] ?? null)
      : null;
    const mail = email.get();
    const song = media.get();
    const w = weather.get().data;
    const day = new Date(now).toDateString();
    const shift = ctx.shifts.upcoming().find((s) => new Date(s.start).toDateString() === day);
    const hhmm = (s: string): string => s.slice(11, 16);
    return describeNow(
      {
        now,
        foreground: contextLine(awareness.foreground()),
        gaming: g.active ? g.game || 'a game' : null,
        jobs: jobLocks.busy().map((b) => b.label),
        nextEvent: next
          ? {
              title: next.title,
              start: next.start,
              ...(next.location ? { location: next.location } : {}),
            }
          : null,
        unread:
          mail.configured && !mail.error
            ? {
                count: mail.unread,
                from: [
                  ...new Set(mail.recent.filter((m) => m.unread).map((m) => senderName(m.from))),
                ],
              }
            : null,
        timers: ctx.timers.list().map((t) => ({ label: t.label, dueAt: t.dueAt, kind: t.kind })),
        shiftToday: shift ? `${hhmm(shift.start)}–${hhmm(shift.end)} ${shift.title}` : null,
        playing: song?.playing ? { title: song.title, artist: song.artist, app: song.app } : null,
        weather: w
          ? {
              label: describeWeather(w.current.code, w.current.isDay).label,
              temp: w.current.temp,
              unit: w.units.temp === 'f' ? '°F' : '°C',
              rainSoonMin: rainSoon(w),
            }
          : null,
        phone: phoneMessageContext(),
      },
      (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    );
  };
  registerAssistantIpc(ctx, {
    chats,
    notes,
    awarenessTools: awareness.tools,
    // One picture of right now, from everything Alton already knows (see shared/context.ts).
    context: () => nowContext(),
    nowPlaying: () => media.get(),
    screen: screenWatch,
    clipboard: (q) => clips.forModel(q),
    email,
    weather: () => weather.get().data,
    routines: () => routines.service.list(),
    saveRoutine: (input) => {
      const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
      const name = String(o.name ?? '').trim();
      const existing = routines.service
        .list()
        .find((r) => r.name.toLowerCase() === name.toLowerCase());
      const r = sanitizeRoutine({ ...o, ...(existing ? { id: existing.id } : {}) });
      if (!r) return { error: 'A routine needs a name.' };
      if (!r.steps.length) return { error: 'None of the steps were valid; check the step kinds.' };
      const problems = r.steps.map(stepProblem).filter(Boolean);
      if (problems.length) return { error: `Some steps need fixing: ${problems.join(' ')}` };
      routines.service.upsert({ ...r, ...(existing ? {} : { id: undefined }) });
      ctx.audit.add(
        'routine',
        `Claude ${existing ? 'updated' : 'created'} the routine "${r.name}"`,
      );
      return {
        saved: r.name,
        replaced: !!existing,
        phrases: r.phrases,
        steps: r.steps.map(describeStep),
        schedule: r.schedule ? describeSchedule(r.schedule) : null,
        note: 'It is in the Routines tab, where the user can edit or delete it.',
      };
    },
    calendar: () => {
      const s = calendar.state();
      return s.configured ? s.events : null;
    },
  });
  registerTimersIpc(ctx);
  registerVoiceIpc(ctx);
  registerSettingsIpc(ctx);
  registerAppIpc(ctx);
  registerUpdatesIpc(ctx);
  const agent = registerAgentIpc(ctx, {
    lessons: () =>
      notes
        .state()
        .memories.filter((m) => m.category === 'apps')
        .map((m) => m.text)
        .slice(-25),
    learn: (l) => {
      notes.remember(l, true, 'apps');
      ctx.audit.add('memory', `Learned about an app: ${l}`);
    },
  });
  registerInitiativeIpc(ctx, {
    events: () => {
      const s = calendar.state();
      return s.configured ? s.events : null;
    },
    weather: () => weather.get().data,
    email: () => {
      const e = email.get();
      return e.configured && !e.error ? e.recent : [];
    },
    routines: () => routines.service.list(),
    busy: () =>
      gaming.get().active ||
      agentBusy(agent.get()) ||
      ctx.timers.focusing() ||
      awareness.foreground()?.fullscreen === true,
    extra: () => {
      const f = awareness.foreground();
      const known = routines.service
        .list()
        .map((r) => r.steps.filter((x) => x.kind === 'launch_app').map((x) => x.target ?? ''));
      return {
        foreground: f,
        errorWindow: !!f && isErrorWindow(f),
        recentErrors: ctx.errors.recentErrors(),
        workflow: awareness.habits.workflow(known),
        usualApp: awareness.habits.usual(),
        staleGoal: notes.staleGoal(),
      };
    },
  });
  registerRemoteIpc(ctx, {
    phone: {
      chats,
      notes,
      routines: () => routines.service.list(),
      execute: (cmd) => commands.execute(cmd),
    },
    agent: () => agent.get(),
    gaming: () => gaming.get(),
    nowPlaying: () => media.get(),
    notices: () => ctx.recentNotices(),
    now: () => nowContext(),
    activeChat: () => {
      const s = chats.state();
      const c = s.chats.find((x) => x.id === s.activeId);
      // Chats from the phone keep the phone's id, so the phone finds its own copy.
      return c ? { id: c.phoneId ?? c.id, title: c.title, updatedAt: c.updatedAt } : null;
    },
    history: () =>
      chats
        .messages(chats.state().activeId)
        .flatMap((m) =>
          m.role === 'user' || m.role === 'assistant'
            ? [
                {
                  who: m.role === 'user' ? ('you' as const) : ('alton' as const),
                  text: m.text.slice(0, 1500),
                },
              ]
            : [],
        )
        .slice(-20),
  });
  registerInfoIpc();
  // Phone messages read out / shown on the PC.
  startPhoneMessages({
    settings: () => ctx.settings.get().phoneMsgs,
    busy: () => gaming.get().active || awareness.foreground()?.fullscreen === true,
    speak: (text) => ctx.command({ type: 'speak', text }),
    show: (title, body) => notifyUser(title, body, 'info'),
    ask: (title, detail) => ctx.askApproval?.(title, detail) ?? Promise.resolve(false),
    autoSend: () => phoneStatus()?.autoSend === true,
  });
  // "While you were away" when the PC starts, wakes from sleep or is unlocked.
  {
    const file = join(app.getPath('userData'), 'last-active.json');
    let awayAt = 0;
    let shiftsKey = '';
    try {
      awayAt = Number((JSON.parse(readFileSync(file, 'utf8')) as { at?: number }).at) || 0;
    } catch {
      /* first run */
    }
    const shiftsNow = (): string => JSON.stringify(ctx.shifts.upcoming());
    const leave = (): void => {
      awayAt = Date.now();
      shiftsKey = shiftsNow();
    };
    const back = (): void => {
      setTimeout(() => {
        const st = ctx.settings.get().phoneMsgs;
        const since = awayAt;
        awayAt = 0;
        if (!st.catchup || !since) return;
        const line = buildCatchup({
          awayMs: Date.now() - since,
          messages: phoneMessages()?.since(since) ?? [],
          missed: ctx.timers
            .list()
            .filter((t) => t.status === 'ringing')
            .map((t) => t.label),
          rotaChanged: !!shiftsKey && shiftsKey !== shiftsNow(),
          payday: phoneStatus()?.payday ?? lastPayday(),
        });
        if (!line) return;
        ctx.command({ type: 'notice', text: line });
        const busy = gaming.get().active || awareness.foreground()?.fullscreen === true;
        if (st.speak && !busy && !inQuietHours(new Date().getHours(), st.quietFrom, st.quietTo))
          ctx.command({ type: 'speak', text: line });
      }, 6000);
    };
    powerMonitor.on('suspend', leave);
    powerMonitor.on('lock-screen', leave);
    powerMonitor.on('resume', back);
    powerMonitor.on('unlock-screen', back);
    if (awayAt) back(); // started up: since Alton was last running
    const stamp = (): void => {
      try {
        writeFileSync(file, JSON.stringify({ at: Date.now() }));
      } catch {
        /* read-only */
      }
    };
    setInterval(stamp, 5 * 60_000).unref?.();
    app.on('before-quit', stamp);
  }
  // Desktop widget, taskbar strip and taskbar features.
  startDesk({
    ctx,
    media: () => media.get(),
    notes: () => notes.state(),
    weather: () => weather.get().data,
    gaming: () => gaming.get().active,
    fullscreen: () => awareness.foreground()?.fullscreen === true,
    mediaKey: (key) =>
      void commands.execute({
        id: `desk-${Date.now()}`,
        action: 'media_control',
        target: key,
        risk: 'safe',
      }),
    syncTelemetry: () => deskHooks.syncTelemetry(),
  });
}

/** For Claude: the last phone message read out (so "reply: …" knows who), and what's waiting. */
function phoneMessageContext(): string {
  const pm = phoneMessages();
  if (!pm) return '';
  const recent = pm.since(Date.now() - 6 * 3_600_000);
  if (!recent.length) return '';
  const last = pm.last ?? pm.latest();
  return `Phone messages in the last 6 hours: ${quickSummary(groupMessages(recent))}${last ? ` The last one read out: ${last.from}${last.chat ? ` in ${last.chat}` : ''} on ${last.app}. If the user says "reply: …", use reply_phone_message.` : ''}`;
}
