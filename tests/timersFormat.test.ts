import { describe, expect, it } from 'vitest';
import { fmtRemaining, timerTitle } from '@renderer/stores/timersStore';

describe('timer formatting', () => {
  it('formats countdowns and default titles', () => {
    expect(fmtRemaining(65_000)).toBe('1:05');
    expect(fmtRemaining(3_725_000)).toBe('1:02:05');
    expect(fmtRemaining(-5)).toBe('0:00');
    expect(
      timerTitle({
        id: 'x',
        label: '',
        durationMs: 25 * 60_000,
        createdAt: 0,
        dueAt: 0,
        status: 'running',
      }),
    ).toBe('25 min timer');
  });
});
