import { describe, expect, it } from 'vitest';
import { DEFAULT_PROMPTS } from '@shared/prompts';
import { allCommands, matchSlash, matchWithArgs } from '@renderer/components/input/slashCommands';

describe('slash commands with saved prompts', () => {
  it('lists saved prompts after the built-ins', () => {
    const names = allCommands(DEFAULT_PROMPTS).map((c) => c.name);
    expect(names).toContain('/focus');
    expect(names).toContain('/fix');
    expect(matchSlash('/fi', DEFAULT_PROMPTS).map((c) => c.name)).toEqual(['/fix']);
  });

  it('splits "/focus 50" and "/fix text" into command and rest', () => {
    expect(matchWithArgs('/focus 50', [])?.cmd.name).toBe('/focus');
    expect(matchWithArgs('/focus 50', [])?.rest).toBe('50');
    const r = matchWithArgs('/fix teh dog', DEFAULT_PROMPTS);
    expect(r?.cmd.prompt).toBe(true);
    expect(r?.rest).toBe('teh dog');
    expect(matchWithArgs('/what is this', DEFAULT_PROMPTS)).toBeNull();
  });
});
