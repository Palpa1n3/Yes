import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { minutesUntil } from '../../src/main/ipc/power';
import { TimerService } from '../../src/main/services/timer-service';

vi.mock('electron', () => ({ app: { on: vi.fn() }, Notification: vi.fn(), powerSaveBlocker: {} }));

describe('scheduled Agent Mode tasks', () => {
  it('works out minutes until a clock time (today or tomorrow)', () => {
    const now = new Date(2026, 10, 19, 15, 43);
    expect(minutesUntil('16:50', undefined, now)).toBe(67);
    expect(minutesUntil('9:05', undefined, now)).toBe(17 * 60 + 22);
    expect(minutesUntil('25:00', undefined, now)).toBeNull();
    expect(minutesUntil(undefined, 30, now)).toBe(30);
    expect(minutesUntil(undefined, 0, now)).toBeNull();
    expect(minutesUntil(undefined, 2000, now)).toBeNull();
  });

  describe('timers', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());
    it('keeps the task with the timer and rings it when due', () => {
      const onRing = vi.fn();
      const t = new TimerService({ onRing, onChange: () => undefined });
      t.add(67, 'Agent: continue Claude Code', 'agent', '  Type continue in Claude Code  ');
      expect(t.list()[0]).toMatchObject({ kind: 'agent', task: 'Type continue in Claude Code' });
      vi.advanceTimersByTime(67 * 60_000);
      expect(onRing).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'agent', task: 'Type continue in Claude Code' }),
      );
      // A focus timer never carries a task.
      t.add(5, 'Focus', 'focus', 'ignored');
      expect(t.list().find((x) => x.kind === 'focus')?.task).toBeUndefined();
    });
  });
});
