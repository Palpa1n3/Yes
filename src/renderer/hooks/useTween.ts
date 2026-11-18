import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

/** Number readouts don't need 60fps; 30 halves the React work of every tween. */
const FRAME_MS = 1000 / 30;

/** During the boot sequence, newly mounted readouts count up from zero. */
let countUpUntil = 0;
export function startCountUp(ms: number): void {
  countUpUntil = performance.now() + ms;
}

/** Eases a number toward `target` so telemetry values glide instead of jumping. */
export function useTween(target: number, ms = 700): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(() =>
    performance.now() < countUpUntil && !reduced ? 0 : target,
  );
  const current = useRef(value);
  const duration = performance.now() < countUpUntil ? Math.max(ms, 1200) : ms;

  useEffect(() => {
    if (reduced) {
      current.current = target;
      setValue(target);
      return;
    }
    const from = current.current;
    const start = performance.now();
    let raf = 0;
    let lastPaint = 0;
    const step = (t: number): void => {
      const k = Math.min(1, (t - start) / duration);
      if (k < 1 && t - lastPaint < FRAME_MS) {
        raf = requestAnimationFrame(step);
        return;
      }
      lastPaint = t;
      const v = from + (target - from) * (1 - (1 - k) ** 3);
      current.current = v;
      setValue(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduced]);

  return value;
}
