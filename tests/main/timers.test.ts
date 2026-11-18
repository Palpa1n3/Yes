import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimerService, describeDuration } from '../../src/main/services/timer-service';

const file = () => join(mkdtempSync(join(tmpdir(), 'arc-tm-')), 'timers.json');

describe('TimerService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = (f?: string) => {
    const onRing = vi.fn();
    const onChange = vi.fn();
    const t = new TimerService({ file: f, onRing, onChange });
    return { t, onRing, onChange };
  };

  it('rings when due and stays ringing until dismissed', () => {
    const { t, onRing } = make();
    const timer = t.add(2, 'tea');
    vi.advanceTimersByTime(119_000);
    expect(onRing).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(onRing).toHaveBeenCalledWith(
      expect.objectContaining({ id: timer.id, label: 'tea', status: 'ringing' }),
    );
    expect(t.list()[0]?.status).toBe('ringing');
    t.dismiss(timer.id);
    expect(t.list()).toEqual([]);
  });

  it('snooze re-arms a ringing timer; on a running one it adds time', () => {
    const { t, onRing } = make();
    const a = t.add(1);
    vi.advanceTimersByTime(60_000);
    t.snooze(a.id, 5);
    expect(t.list()[0]).toMatchObject({ status: 'running' });
    vi.advanceTimersByTime(5 * 60_000);
    expect(onRing).toHaveBeenCalledTimes(2);
    const b = t.add(10);
    t.snooze(b.id, 5);
    expect(t.list().find((x) => x.id === b.id)?.durationMs).toBe(15 * 60_000);
  });

  it('cancels by label or all, and lists ringing first then soonest', () => {
    const { t } = make();
    t.add(30, 'check the oven');
    t.add(5, 'stretch');
    t.add(60, 'call mum');
    expect(t.list().map((x) => x.label)).toEqual(['stretch', 'check the oven', 'call mum']);
    expect(t.cancelMatching('oven').map((x) => x.label)).toEqual(['check the oven']);
    expect(t.cancelMatching('all')).toHaveLength(2);
    expect(t.list()).toEqual([]);
  });

  it('enforces limits', () => {
    const { t } = make();
    expect(() => t.add(0)).toThrow(/up to 24 hours/);
    expect(() => t.add(24 * 60 + 1)).toThrow(/up to 24 hours/);
    for (let i = 0; i < 20; i++) t.add(10);
    expect(() => t.add(10)).toThrow(/already have 20 timers/);
  });

  it('survives a restart, and rings timers that finished while ARC was closed', () => {
    const f = file();
    const first = make(f);
    first.t.add(10, 'laundry');
    first.t.add(1, 'kettle');
    first.t.dispose(); // ARC quits
    vi.advanceTimersByTime(5 * 60_000); // 5 minutes pass while closed
    const second = make(f);
    second.t.load();
    vi.advanceTimersByTime(0);
    expect(second.onRing).toHaveBeenCalledWith(expect.objectContaining({ label: 'kettle' }));
    expect(second.t.list().find((x) => x.label === 'laundry')?.status).toBe('running');
    vi.advanceTimersByTime(5 * 60_000);
    expect(second.onRing).toHaveBeenCalledTimes(2);
  });

  it('describes durations', () => {
    expect(describeDuration(0.5)).toBe('30 second');
    expect(describeDuration(120)).toBe('2 hour');
  });

  it('drops very old ringing timers and junk on load', () => {
    const f = file();
    const now = Date.now();
    writeFileSync(
      f,
      JSON.stringify([
        {
          id: 'old',
          label: 'ancient',
          durationMs: 60_000,
          createdAt: now - 2 * 86_400_000,
          dueAt: now - 86_400_000,
          status: 'ringing',
        },
        { nonsense: true },
        {
          id: 'ok',
          label: 'soon',
          durationMs: 60_000,
          createdAt: now,
          dueAt: now + 60_000,
          status: 'running',
        },
      ]),
    );
    const { t } = make(f);
    t.load();
    expect(t.list().map((x) => x.id)).toEqual(['ok']);
  });
});
