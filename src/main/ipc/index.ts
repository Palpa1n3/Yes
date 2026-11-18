import { shell } from 'electron';
import type { MainContext } from '../context';
import { SkillRegistry, systemReportSkill } from '../services/skills';
import { toWebUrl } from '../services/command-executor';
import { registerAppIpc } from './app';
import { registerAssistantIpc } from './assistant';
import { registerCommandsIpc } from './commands';
import { registerInfoIpc } from './info';
import { registerTimersIpc } from './timers';
import { registerSettingsIpc } from './settings';
import { registerSystemIpc } from './system';
import { registerWindowIpc } from './window';

/** Central registration: every channel group is wired here, once. */
export function registerIpc(ctx: MainContext): void {
  registerWindowIpc(ctx);
  registerSystemIpc(ctx);
  registerAssistantIpc(
    ctx.getWindow,
    () => ctx.telemetry.snapshot(),
    () => ctx.settings.get(),
    () => ctx.telemetry.snapshotWithProcesses(),
    () => ctx.telemetry.warmProcesses(),
    () => ctx.timers.list(),
  );
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
  registerCommandsIpc(skills, ctx.timers);
  registerTimersIpc(ctx);
  registerSettingsIpc(ctx);
  registerAppIpc(ctx);
  registerInfoIpc();
}
