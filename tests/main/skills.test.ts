import { describe, expect, it, vi } from 'vitest';
import { toCommand } from '@shared/commands';
import type { ArcSkill, SkillContext } from '@shared/skills';
import { DEFAULT_SETTINGS } from '@shared/types';
import { SkillRegistry, systemReportSkill } from '../../src/main/services/skills';
import { snapshot } from '../../src/main/services/system-stats';

const ctx: SkillContext = {
  settings: () => DEFAULT_SETTINGS,
  stats: snapshot,
  openUrl: vi.fn(async () => undefined),
  log: vi.fn(),
};

describe('SkillRegistry', () => {
  it('routes by action, lets skills decline, and falls through with null', async () => {
    const reg = new SkillRegistry(ctx);
    const decline: ArcSkill = {
      id: 'a',
      name: 'A',
      intents: [],
      actions: ['launch_app'],
      handler: vi.fn(async () => null),
    };
    const take: ArcSkill = {
      id: 'b',
      name: 'B',
      intents: [],
      actions: ['launch_app'],
      handler: vi.fn(async (c) => ({
        commandId: c.id,
        status: 'success' as const,
        message: 'B did it',
        timestamp: 0,
      })),
    };
    reg.register(decline);
    reg.register(take);
    expect(await reg.handle(toCommand({ action: 'start', target: 'x' }, '1'))).toMatchObject({
      message: 'B did it',
    });
    expect(decline.handler).toHaveBeenCalled();
    expect(await reg.handle(toCommand({ action: 'web search', target: 'x' }, '2'))).toBeNull();
  });

  it('a throwing skill becomes a readable failure', async () => {
    const reg = new SkillRegistry(ctx);
    reg.register({
      id: 'boom',
      name: 'Boom',
      intents: [],
      actions: ['search_web'],
      handler: async () => {
        throw new Error('x');
      },
    });
    expect(await reg.handle(toCommand({ action: 'search', target: 'q' }, '1'))).toMatchObject({
      status: 'failed',
      message: 'Boom hit an error.',
    });
    expect(() =>
      reg.register({
        id: 'boom',
        name: 'Again',
        intents: [],
        actions: [],
        handler: async () => null,
      }),
    ).toThrow(/already registered/);
  });

  it('system report summarises live stats', async () => {
    const r = await systemReportSkill.handler(toCommand({ action: 'system status' }, '1'), ctx);
    expect(r?.message).toMatch(/^CPU \d+% · RAM [\d.]+\/[\d.]+ GB/);
  });
});
