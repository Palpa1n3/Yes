import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PROMPTS,
  expandPrompt,
  matchPromptCommand,
  promptName,
  sanitizePrompts,
} from '../../src/shared/prompts';
import { sanitizeSettings } from '../../src/shared/settings';
import { TimerService } from '../../src/main/services/timer-service';
import { plan } from '../../src/main/services/ai-provider';
import { DEFAULT_PERSONALITY } from '../../src/shared/personalities';

describe('saved prompts', () => {
  it('normalises names and drops reserved, duplicate and empty ones', () => {
    expect(promptName('/Email Reply!')).toBe('email-reply');
    const out = sanitizePrompts([
      { name: 'Fix', text: 'a {text}' },
      { name: 'fix', text: 'dup' },
      { name: 'help', text: 'reserved' },
      { name: '', text: 'no name' },
      { name: 'empty', text: '  ' },
      'junk',
    ]);
    expect(out).toEqual([{ name: 'fix', text: 'a {text}' }]);
    expect(sanitizePrompts(undefined)).toEqual(DEFAULT_PROMPTS);
  });

  it('fills {text}, or appends when there is no placeholder', () => {
    expect(expandPrompt({ name: 'a', text: 'Fix: {text}' }, ' hi ')).toBe('Fix: hi');
    expect(expandPrompt({ name: 'a', text: 'Be brief.' }, 'hello')).toBe('Be brief.\n\nhello');
    expect(expandPrompt({ name: 'a', text: 'Be brief.' }, '')).toBe('Be brief.');
  });

  it('matches /name with what follows it', () => {
    const r = matchPromptCommand('/FIX teh cat\nsat', DEFAULT_PROMPTS);
    expect(r?.prompt.name).toBe('fix');
    expect(r?.rest).toBe('teh cat\nsat');
    expect(matchPromptCommand('/nope x', DEFAULT_PROMPTS)).toBeNull();
    expect(matchPromptCommand('fix this', DEFAULT_PROMPTS)).toBeNull();
  });

  it('settings keep prompts and the clipboard shortcut', () => {
    const s = sanitizeSettings({
      prompts: [{ name: 'tidy', text: 'Tidy {text}' }],
      clipboardHotkey: '',
    });
    expect(s.prompts).toEqual([{ name: 'tidy', text: 'Tidy {text}' }]);
    expect(s.clipboardHotkey).toBe('');
    const d = sanitizeSettings({});
    expect(d.prompts.length).toBe(DEFAULT_PROMPTS.length);
    expect(d.clipboardHotkey).toBe('CommandOrControl+Alt+C');
  });
});

describe('focus sessions', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('only one runs at a time and focusing() follows it', () => {
    const onRing = vi.fn();
    const t = new TimerService({ onRing, onChange: () => undefined });
    t.add(5, 'tea');
    expect(t.focusing()).toBe(false);
    t.add(25, 'Focus session', 'focus');
    t.add(50, 'Focus session', 'focus');
    expect(t.list().filter((x) => x.kind === 'focus')).toHaveLength(1);
    expect(t.list()).toHaveLength(2);
    expect(t.focusing()).toBe(true);
    vi.advanceTimersByTime(50 * 60_000);
    expect(onRing).toHaveBeenCalledWith(expect.objectContaining({ kind: 'focus' }));
    expect(t.focusing()).toBe(false);
  });

  it('“focus for 30 minutes” starts one in the offline replies', () => {
    const snap = () => ({}) as never;
    const p = plan('focus for 30 minutes', 0, snap, {
      personality: DEFAULT_PERSONALITY,
      userName: '',
    });
    expect(p.intent).toEqual({
      action: 'set_timer',
      target: '30',
      args: ['Focus session', 'focus'],
    });
    const q = plan('focus mode', 0, snap, { personality: DEFAULT_PERSONALITY, userName: '' });
    expect(q.intent?.target).toBe('25');
  });
});
