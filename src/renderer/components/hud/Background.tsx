import { useEffect, useRef } from 'react';
import { useReducedMotion } from '@renderer/hooks/useReducedMotion';

const PARTICLES = 48;
const FRAME_MS = 1000 / 20; // slow drift reads fine at 20fps; keeps idle CPU low

/** Grid + vignette (CSS) and a sparse drifting particle field (canvas). Paused when hidden. */
export function Background({
  scanlines,
  particles = true,
}: {
  scanlines: boolean;
  particles?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || reduced || !particles) {
      ctx?.clearRect(0, 0, canvas?.width ?? 0, canvas?.height ?? 0);
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const resize = (): void => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);

    const ps = Array.from({ length: PARTICLES }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.00012,
      vy: -0.00004 - Math.random() * 0.0001,
      r: 0.5 + Math.random() * 1.2,
      a: 0.15 + Math.random() * 0.35,
    }));

    let accent = '63 208 255';
    let raf = 0;
    let last = 0;
    let frame = 0;
    const draw = (t: number): void => {
      raf = requestAnimationFrame(draw);
      if (t - last < FRAME_MS) return;
      last = t;
      if (frame++ % 60 === 0) {
        accent =
          getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || accent;
      }
      const { width: W, height: H } = canvas;
      ctx.clearRect(0, 0, W, H);
      for (const p of ps) {
        p.x = (p.x + p.vx + 1) % 1;
        p.y = (p.y + p.vy + 1) % 1;
        ctx.beginPath();
        ctx.arc(p.x * W, p.y * H, p.r * dpr, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${accent} / ${p.a})`;
        ctx.fill();
      }
    };
    const start = (): void => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(draw);
    };
    document.addEventListener('visibilitychange', start);
    start();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', start);
    };
  }, [reduced, particles]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgb(var(--accent) / 0.045) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--accent) / 0.045) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          backgroundPosition: 'center center',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 55% at 50% 45%, rgb(var(--accent) / 0.07), transparent 70%), radial-gradient(ellipse at center, transparent 50%, rgb(var(--bg-void) / 0.85) 100%)',
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {scanlines && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, rgb(255 255 255 / 0.03) 0 1px, transparent 1px 3px)',
          }}
        />
      )}
    </div>
  );
}
