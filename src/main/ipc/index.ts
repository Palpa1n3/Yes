import { JourneyService, LeaveReminders } from '../services/journey';
import { shell, Notification } from 'electron';
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
        if (Notification.isSupported())
          new Notification({ title: ctx.settings.get().assistantName, body: text }).show();
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
  registerAssistantIpc(ctx, {
    chats,
    notes,
    awarenessTools: awareness.tools,
    context: () => {
      const g = gaming.get();
      return [
        contextLine(awareness.foreground()),
        g.active ? `The user is gaming${g.game ? ` (${g.game})` : ''}.` : '',
      ]
        .filter(Boolean)
        .join(' ');
    },
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
}
