import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantState } from '@shared/types';
import {
  ERROR_HOLD_MS,
  STATE_TARGETS,
  mixColor,
  settled,
  stepParams,
} from '@renderer/components/core/motion';
import { fakeLevel } from '@renderer/hooks/useFakeAudio';
import { useAssistantStore } from '@renderer/stores/assistantStore';

const ALL: AssistantState[] = ['idle', 'listening', 'thinking', 'speaking', 'executing', 'error'];

describe('core motion model', () => {
  it('defines a distinct target for every state', () => {
    const seen = new Set(ALL.map((s) => JSON.stringify(STATE_TARGETS[s])));
    expect(seen.size).toBe(ALL.length);
  });

  it('colour mix always sums to 1', () => {
    for (const s of ALL) expect(STATE_TARGETS[s].mix.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it('eases toward the target and settles, independent of frame rate', () => {
    const from = STATE_TARGETS.idle;
    const to = STATE_TARGETS.executing;
    // 1s at 60fps vs 1s at 30fps should land in nearly the same place.
    let a = from;
    for (let i = 0; i < 60; i++) a = stepParams(a, to, 1 / 60);
    let b = from;
    for (let i = 0; i < 30; i++) b = stepParams(b, to, 1 / 30);
    expect(a.progress).toBeCloseTo(b.progress, 5);
    expect(settled(a, to)).toBe(true);
    expect(settled(from, to)).toBe(false);
  });

  it('blends theme colours by state', () => {
    const colors = { accent: [0, 0, 255], amber: [255, 128, 0], alert: [255, 0, 0] } as const;
    const c = {
      accent: [...colors.accent],
      amber: [...colors.amber],
      alert: [...colors.alert],
    } as Parameters<typeof mixColor>[1];
    expect(mixColor(STATE_TARGETS.executing.mix, c)).toEqual([255, 128, 0]);
    expect(mixColor([0.5, 0, 0.5], c)).toEqual([128, 0, 128]);
  });

  it('fake audio stays within 0–1', () => {
    for (let t = 0; t < 20; t += 0.013) {
      for (const s of ['listening', 'speaking'] as const) {
        const v = fakeLevel(t, s);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('assistantStore state', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('error flickers then settles back to idle', () => {
    useAssistantStore.getState().setState('error');
    expect(useAssistantStore.getState().state).toBe('error');
    vi.advanceTimersByTime(ERROR_HOLD_MS + 1);
    expect(useAssistantStore.getState().state).toBe('idle');
  });

  it('a new state cancels the pending error revert', () => {
    const { setState } = useAssistantStore.getState();
    setState('error');
    setState('executing', 'Launching · VS Code');
    vi.advanceTimersByTime(ERROR_HOLD_MS + 1);
    expect(useAssistantStore.getState().state).toBe('executing');
    expect(useAssistantStore.getState().stateDetail).toBe('Launching · VS Code');
  });
});
