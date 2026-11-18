/** Pure motion model for the core. Each assistant state maps to a target set of
 *  parameters; the renderer eases the live parameters toward the target every frame,
 *  so state changes blend instead of snapping. No DOM here — unit-testable. */
import type { AssistantState } from '@shared/types';

export type CoreColor = 'accent' | 'amber' | 'alert';

export interface CoreParams {
  speed: number; // rotation multiplier
  orb: number; // 0–1 orb brightness
  breathe: number; // 0–1 idle breathing depth
  scanner: number; // 0–1 sweeping-segment mode
  wave: number; // 0–1 waveform ring
  ripple: number; // 0–1 outward ripples
  progress: number; // 0–1 rotating progress arc
  flicker: number; // 0–1 error flicker
  /** Accent mix: [accent, amber, alert] weights, summing to 1. */
  mix: [number, number, number];
}

const base: CoreParams = {
  speed: 1,
  orb: 0.6,
  breathe: 1,
  scanner: 0,
  wave: 0,
  ripple: 0,
  progress: 0,
  flicker: 0,
  mix: [1, 0, 0],
};

export const STATE_TARGETS: Record<AssistantState, CoreParams> = {
  idle: base,
  listening: { ...base, speed: 2.8, orb: 0.85, breathe: 0, ripple: 1 },
  thinking: { ...base, speed: 1.6, orb: 0.25, breathe: 0, scanner: 1 },
  speaking: { ...base, speed: 1.2, orb: 0.9, breathe: 0, wave: 1 },
  executing: { ...base, speed: 1.4, orb: 0.7, breathe: 0, progress: 1, mix: [0, 1, 0] },
  error: { ...base, speed: 0.3, orb: 0.5, breathe: 0, flicker: 1, mix: [0, 0, 1] },
};

/** How long `error` shows before settling back to idle. */
export const ERROR_HOLD_MS = 1400;

/** Frame-rate-independent exponential ease toward target. `rate` ≈ 1/time-constant (s⁻¹). */
export function stepParams(cur: CoreParams, target: CoreParams, dt: number, rate = 6): CoreParams {
  const k = 1 - Math.exp(-Math.max(0, dt) * rate);
  const l = (a: number, b: number): number => a + (b - a) * k;
  return {
    speed: l(cur.speed, target.speed),
    orb: l(cur.orb, target.orb),
    breathe: l(cur.breathe, target.breathe),
    scanner: l(cur.scanner, target.scanner),
    wave: l(cur.wave, target.wave),
    ripple: l(cur.ripple, target.ripple),
    progress: l(cur.progress, target.progress),
    flicker: l(cur.flicker, target.flicker),
    mix: [l(cur.mix[0], target.mix[0]), l(cur.mix[1], target.mix[1]), l(cur.mix[2], target.mix[2])],
  };
}

/** True once every parameter is within `eps` of its target (lets the renderer drop to a low frame rate). */
export function settled(cur: CoreParams, target: CoreParams, eps = 0.01): boolean {
  const keys = [
    'speed',
    'orb',
    'breathe',
    'scanner',
    'wave',
    'ripple',
    'progress',
    'flicker',
  ] as const;
  return (
    keys.every((k) => Math.abs(cur[k] - target[k]) < eps) &&
    cur.mix.every((m, i) => Math.abs(m - (target.mix[i] ?? 0)) < eps)
  );
}

export type RGB = [number, number, number];

export function mixColor(mix: CoreParams['mix'], colors: Record<CoreColor, RGB>): RGB {
  const [a, b, c] = mix;
  const { accent: x, amber: y, alert: z } = colors;
  const ch = (i: 0 | 1 | 2): number => Math.round(x[i] * a + y[i] * b + z[i] * c);
  return [ch(0), ch(1), ch(2)];
}
