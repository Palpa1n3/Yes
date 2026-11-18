import { shell } from 'electron';
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
import { registerGamingIpc } from './gaming';
import { registerVoiceIpc } from './voice';
import { registerSettingsIpc } from './settings';
import { registerSystemIpc } from './system';
import { registerWindowIpc } from './window';

/** Central registration: every channel group is wired here, once. */
export function registerIpc(ctx: MainContext): void {
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
  const commands = registerCommandsIpc(skills, ctx.timers);
  const calendar = registerCalendarIpc(ctx);
  const notes = registerNotesIpc(ctx);
  const media = registerMediaIpc(ctx);
  registerCleanupIpc(ctx);
  const routines = registerRoutinesIpc(ctx, commands.execute, weather, calendar, notes);
  commands.setRoutineRunner(routines.run);
  registerGamingIpc(ctx, commands.execute);
  const chats = registerChatsIpc(ctx);
  registerAssistantIpc(ctx, {
    chats,
    notes,
    nowPlaying: () => media.get(),
    weather: () => weather.get().data,
    routines: () => routines.service.list(),
    calendar: () => {
      const s = calendar.state();
      return s.configured ? s.events : null;
    },
  });
  registerTimersIpc(ctx);
  registerVoiceIpc(ctx);
  registerSettingsIpc(ctx);
  registerAppIpc(ctx);
  registerInfoIpc();
}
