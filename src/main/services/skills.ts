import type { CanonicalCommand, CommandResult } from '@shared/commands';
import type { ArcSkill, SkillContext } from '@shared/skills';

/** Routes commands to skills, in registration order. */
export class SkillRegistry {
  private skills: ArcSkill[] = [];

  constructor(private readonly ctx: SkillContext) {}

  register(skill: ArcSkill): void {
    if (this.skills.some((s) => s.id === skill.id))
      throw new Error(`Skill "${skill.id}" is already registered`);
    this.skills.push(skill);
  }

  list(): ArcSkill[] {
    return [...this.skills];
  }

  /** First skill that handles the command wins; null if none claim it. A throwing skill
   *  becomes a readable failure instead of crashing the pipeline. */
  async handle(cmd: CanonicalCommand): Promise<CommandResult | null> {
    for (const s of this.skills) {
      if (!s.actions.includes(cmd.action)) continue;
      try {
        const r = await s.handler(cmd, this.ctx);
        if (r) return r;
      } catch (err) {
        this.ctx.log(`skill ${s.id} failed: ${String(err)}`);
        return {
          commandId: cmd.id,
          status: 'failed',
          message: `${s.name} hit an error.`,
          timestamp: Date.now(),
        };
      }
    }
    return null;
  }
}

/** Built-in example skill: a real system report for `system_query`. */
export const systemReportSkill: ArcSkill = {
  id: 'system-report',
  name: 'System report',
  intents: ['system status', "how's my pc", 'diagnostics'],
  actions: ['system_query'],
  async handler(cmd, ctx) {
    const s = ctx.stats();
    const gb = (b: number): string => (b / 1024 ** 3).toFixed(1);
    const fullest = [...s.disks].sort((a, b) => b.used / b.size - a.used / a.size)[0];
    const parts = [
      `CPU ${Math.round(s.cpu.load)}%`,
      `RAM ${gb(s.memory.used)}/${gb(s.memory.total)} GB`,
      s.gpu?.load != null ? `GPU ${Math.round(s.gpu.load)}%` : null,
      fullest ? `${fullest.mount} ${Math.round((fullest.used / fullest.size) * 100)}% full` : null,
    ].filter(Boolean);
    return {
      commandId: cmd.id,
      status: 'success',
      message: parts.join(' · '),
      timestamp: Date.now(),
    };
  },
};
