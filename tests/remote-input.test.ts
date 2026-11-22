import { describe, expect, it } from 'vitest';
import { sanitizeInput, toPhysical, typingDiff } from '@shared/remote-input';

describe('phone remote control input', () => {
  it('accepts taps, scrolls, drags, keys and text, clamped to the screen', () => {
    expect(sanitizeInput({ type: 'click', x: 0.5, y: 2 })).toEqual({ type: 'click', x: 0.5, y: 1 });
    expect(sanitizeInput({ type: 'scroll', x: 0.1, y: 0.1, dy: -40 })).toMatchObject({ dy: -15 });
    expect(sanitizeInput({ type: 'drag', x: 0, y: 0, x2: 1, y2: 1 })).toMatchObject({
      type: 'drag',
    });
    expect(sanitizeInput({ type: 'key', keys: 'ctrl+c' })).toEqual({ type: 'key', keys: 'ctrl+c' });
    expect(sanitizeInput({ type: 'type', text: 'hello' })).toEqual({ type: 'type', text: 'hello' });
  });
  it('refuses anything else', () => {
    expect(sanitizeInput({ type: 'click', x: 'a', y: 0 })).toBeNull();
    expect(sanitizeInput({ type: 'key', keys: 'ctrl+$(rm)' })).toBeNull();
    expect(sanitizeInput({ type: 'scroll', x: 0, y: 0, dy: 0 })).toBeNull();
    expect(sanitizeInput({ type: 'shell', x: 0, y: 0 })).toBeNull();
  });
  it('maps onto the display in physical pixels', () => {
    const d = { bounds: { x: 0, y: 0, width: 1921, height: 1081 }, scaleFactor: 1.25 };
    expect(toPhysical(0.5, 0.5, d)).toEqual({ x: 1200, y: 675 });
    expect(
      toPhysical(0, 0, { bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }),
    ).toEqual({
      x: -1920,
      y: 0,
    });
  });
});

describe('typing from a phone keyboard', () => {
  it('sends only the new letters when the keyboard re-sends the whole word', () => {
    let sent = '';
    let pc = '';
    for (const now of ['a', 'ad', 'add', 'add ', 'add t', 'add th', 'add thi', 'add this']) {
      const d = typingDiff(sent, now);
      pc = pc.slice(0, pc.length - d.back) + d.text;
      sent = now;
    }
    expect(pc).toBe('add this');
  });
  it('backspaces over an autocorrected word', () => {
    expect(typingDiff('teh ', 'the ')).toEqual({ back: 3, text: 'he ' });
    expect(typingDiff('hello', 'hell')).toEqual({ back: 1, text: '' });
  });
});
