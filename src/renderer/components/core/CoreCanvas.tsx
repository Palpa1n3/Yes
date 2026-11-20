import { memo, useEffect, useRef } from 'react';
import type { AssistantState } from '@shared/types';
import { runRings } from './rings';

interface Props {
  size: { w: number; h: number };
  center: { x: number; y: number };
  radius: number;
  state: AssistantState;
  ringText: string;
  reducedMotion: boolean;
  /** Read once per frame; real microphone / TTS levels plug in here. */
  getLevel: () => number;
  /** Changes when the theme changes so colours are re-read immediately. */
  themeKey: string;
}

export const CoreCanvas = memo(function CoreCanvas({
  size,
  center,
  radius,
  state,
  ringText,
  reducedMotion,
  getLevel,
  themeKey,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const sinceRef = useRef(performance.now());
  const draw = useRef<(() => void) | null>(null);

  useEffect(() => {
    stateRef.current = state;
    sinceRef.current = performance.now();
    draw.current?.();
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return runRings(
      canvas,
      { w: size.w, h: size.h },
      {
        center: { x: center.x, y: center.y },
        radius,
        ringText,
        reducedMotion,
        getLevel,
        stateRef,
        sinceRef,
        draw,
      },
    );
  }, [size.w, size.h, center.x, center.y, radius, ringText, reducedMotion, getLevel, themeKey]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />;
});
