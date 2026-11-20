import { memo, useEffect, useRef } from 'react';
import type { AssistantState } from '@shared/types';
import { runCodeRing } from './codeRing';

interface Props {
  size: { w: number; h: number };
  center: { x: number; y: number };
  radius: number;
  state: AssistantState;
  reducedMotion: boolean;
  getLevel: () => number;
  themeKey: string;
}

export const CoreCode = memo(function CoreCode({
  size,
  center,
  radius,
  state,
  reducedMotion,
  getLevel,
  themeKey,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ state, reducedMotion, getLevel, center, radius });
  live.current = { state, reducedMotion, getLevel, center, radius };
  const stillKey = reducedMotion ? state : null;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    return runCodeRing(canvas, { w: size.w, h: size.h }, live);
  }, [size.w, size.h, themeKey, reducedMotion, stillKey]);

  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute inset-0"
      style={{ width: size.w, height: size.h }}
      aria-hidden
    />
  );
});
