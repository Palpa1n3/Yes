import { memo, useEffect, useRef } from 'react';
import type { AssistantState } from '@shared/types';
import { runAvatar, type EngineName } from './engines';

interface Props {
  engine: EngineName;
  size: { w: number; h: number };
  center: { x: number; y: number };
  radius: number;
  state: AssistantState;
  reducedMotion: boolean;
  getLevel: () => number;
  themeKey: string;
}

/** React wrapper for the canvas engines (wave, swarm, orb, head). */
export const CoreEngine = memo(function CoreEngine({
  engine,
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

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    return runAvatar(canvas, engine, {
      state: () => live.current.state,
      level: () => live.current.getLevel(),
      center: () => live.current.center,
      radius: () => live.current.radius,
      reduced: () => live.current.reducedMotion,
    });
  }, [engine, themeKey]);

  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute inset-0"
      style={{ width: size.w, height: size.h }}
      aria-hidden
    />
  );
});
