import { memo, useEffect, useRef } from 'react';
import type { AssistantState } from '@shared/types';
import { runSphere } from './sphere';

interface Props {
  size: { w: number; h: number };
  center: { x: number; y: number };
  radius: number;
  state: AssistantState;
  reducedMotion: boolean;
  getLevel: () => number;
  themeKey: string;
  /** 'sphere': a gold globe. 'cloud': a blue, lumpy, shape-shifting mass of light. */
  variant?: 'sphere' | 'cloud';
}

export const CoreSphere = memo(function CoreSphere({
  size,
  center,
  radius,
  state,
  reducedMotion,
  getLevel,
  themeKey,
  variant = 'sphere',
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ state, reducedMotion, getLevel, center, radius });
  live.current = { state, reducedMotion, getLevel, center, radius };
  const stillKey = reducedMotion ? state : null;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    return runSphere(canvas, { w: size.w, h: size.h }, live, variant);
  }, [size.w, size.h, themeKey, reducedMotion, stillKey, variant]);

  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute inset-0"
      style={{ width: size.w, height: size.h }}
      aria-hidden
    />
  );
});
