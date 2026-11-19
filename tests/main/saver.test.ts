import { describe, expect, it } from 'vitest';
import { sanitizeSettings } from '../../src/shared/settings';
import { webTools } from '../../src/main/services/anthropic-provider';
import { EXTRA_TOOL_DEFS } from '../../src/main/services/extra-tool-defs';

describe('saver mode and phone messages', () => {
  it('saver mode is off unless switched on', () => {
    expect(sanitizeSettings({}).saver).toBe(false);
    expect(sanitizeSettings({ saver: true }).saver).toBe(true);
  });
  it('fewer web searches in saver mode', () => {
    const t = webTools('claude-haiku-5-5', 2) as Array<{ max_uses?: number }>;
    expect(t.map((x) => x.max_uses)).toEqual([2, 2]);
    expect((webTools('claude-sonnet-5-5') as Array<{ max_uses?: number }>)[0]?.max_uses).toBe(5);
  });
  it('Claude can read and reply to phone messages', () => {
    const t = EXTRA_TOOL_DEFS.find((x) => x.name === 'phone_messages');
    expect(t?.description).toContain('Phone Link');
    expect(t?.description).toContain('ALWAYS asks the user before pressing Send');
  });
});
