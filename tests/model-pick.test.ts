import { describe, expect, it } from 'vitest';
import { complexity, pickModel } from '@shared/model-pick';

const auto = (text: string, attachments: Array<{ kind: string }> = []) =>
  pickModel({
    text,
    attachments,
    chosen: 'claude-haiku-5-5',
    auto: true,
    top: 'claude-sonnet-5-5',
    saver: false,
  }).model;

describe('picking the model for each message', () => {
  it('keeps everyday requests on the fast model', () => {
    for (const t of [
      'set a timer for 10 minutes',
      "what's the weather",
      'play something chill on Spotify',
      'thanks!',
      'who is Fives?',
      'add milk to my shopping list',
    ])
      expect(auto(t)).toBe('claude-haiku-5-5');
  });

  it('sends messages that need more thought to the stronger model', () => {
    expect(
      auto('Can you compare these two monitors and tell me the pros and cons for gaming?'),
    ).toBe('claude-sonnet-5-5');
    expect(
      auto('Why does my game crash? Error: access violation at 0x278938\n```\nstack...\n```'),
    ).toBe('claude-sonnet-5-5');
    expect(auto('Write me a cover letter for a barista job at a café in Neath, step by step')).toBe(
      'claude-sonnet-5-5',
    );
    expect(auto('Here is my payslip, check it', [{ kind: 'pdf' }, { kind: 'image' }])).toBe(
      'claude-sonnet-5-5',
    );
  });

  it('respects Saver mode and a switched-off automatic choice', () => {
    const base = {
      text: 'Plan and design a full architecture review, step by step',
      chosen: 'claude-opus-5-5' as const,
      top: 'claude-sonnet-5-5' as const,
    };
    expect(pickModel({ ...base, auto: true, saver: true }).model).toBe('claude-haiku-5-5');
    expect(pickModel({ ...base, auto: false, saver: false }).model).toBe('claude-opus-5-5');
    expect(complexity('hi')).toBe(0);
  });
});
