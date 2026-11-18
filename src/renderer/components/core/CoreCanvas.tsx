import { memo, useEffect, useRef } from 'react';
import type { AssistantState } from '@shared/types';
import {
  STATE_TARGETS,
  mixColor,
  settled,
  stepParams,
  type CoreColor,
  type CoreParams,
  type RGB,
} from './motion';

/** Canvas renderer for the core. One rAF loop, no React work per frame.
 *  - Unit space: outer radius 210, origin at centre.
 *  - Drops to ~30fps when idle and settled; stops entirely while the window is hidden.
 *  - Reduced motion: renders a single static frame per state change. */

const TAU = Math.PI * 2;
const SEGMENTS = 14;
const SEG_ALPHA = [0.35, 0.95, 0.5, 0.3, 0.55, 0.4, 0.3, 0.45, 0.95, 0.35, 0.5, 0.3, 0.45, 0.4];
const IDLE_FRAME_MS = 1000 / 24; // idle rotation is slow enough that 24fps looks identical

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

function readColors(): Record<CoreColor, RGB> {
  const css = getComputedStyle(document.documentElement);
  const parse = (name: string, fallback: RGB): RGB => {
    const parts = css.getPropertyValue(name).trim().split(/\s+/).map(Number);
    return parts.length === 3 && parts.every((n) => Number.isFinite(n)) ? (parts as RGB) : fallback;
  };
  return {
    accent: parse('--accent', [63, 208, 255]),
    amber: parse('--amber', [255, 181, 71]),
    alert: parse('--alert', [255, 77, 94]),
  };
}

const rgba = (c: RGB, a: number): string =>
  `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;

/** The circular readout text is the most expensive thing to draw, so it's cached
 *  per (text, colour) and blitted rotated each frame. */
function renderTextRing(text: string, color: RGB, px: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const size = Math.ceil(420 * px);
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.setTransform(px, 0, 0, px, size / 2, size / 2);
  ctx.font = '500 9px "JetBrains Mono", monospace';
  ctx.fillStyle = rgba(color, 0.55);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const r = 186;
  const step = 0.052; // radians per character
  let a = -Math.PI / 2 - (text.length * step) / 2;
  for (const ch of text) {
    ctx.save();
    ctx.rotate(a);
    ctx.translate(r, 0);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    a += step;
  }
  return c;
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
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || radius <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const scale = radius / 210;

    let colors = readColors();
    let params: CoreParams = { ...STATE_TARGETS[stateRef.current] };
    let textCache: { key: string; img: HTMLCanvasElement } | null = null;
    // Rotation accumulators (radians) for each ring.
    const rot = { ticks: 0, text: 0, segs: 0, dash: 0, scan: 0, prog: 0 };
    const ripples: number[] = []; // ages in seconds
    let rippleClock = 0;
    let last = performance.now();
    let lastPaint = 0;
    let frame = 0;
    let raf = 0;

    const paint = (now: number, dt: number): void => {
      const target = STATE_TARGETS[stateRef.current];
      params = reducedMotion ? { ...target } : stepParams(params, target, dt);
      const level = Math.max(0, Math.min(1, getLevel()));
      const t = now / 1000;
      const color = mixColor(params.mix, colors);

      if (!reducedMotion) {
        const s = params.speed * dt;
        rot.ticks += s * 0.03;
        rot.text -= s * 0.045;
        rot.segs += s * 0.08;
        rot.dash -= s * 0.14;
        rot.scan += dt * 4.2 * params.scanner;
        rot.prog += dt * 3.2;
      }

      // Error flicker: brief stutter in overall alpha during the first ~500ms.
      const sinceErr = (now - sinceRef.current) / 1000;
      const flick =
        params.flicker > 0.05 && stateRef.current === 'error' && sinceErr < 0.5 && !reducedMotion
          ? Math.sin(sinceErr * 90) > 0.2
            ? 1
            : 0.35
          : 1;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, center.x * dpr, center.y * dpr);
      ctx.globalAlpha = flick;

      // ── outer hairline + tick ring ─────────────────────────
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(color, 0.18);
      ctx.beginPath();
      ctx.arc(0, 0, 210, 0, TAU);
      ctx.stroke();

      ctx.save();
      ctx.rotate(rot.ticks);
      ctx.beginPath();
      for (let i = 0; i < 144; i++) {
        if (i % 12 === 0) continue;
        const a = (i / 144) * TAU;
        ctx.moveTo(Math.cos(a) * 197, Math.sin(a) * 197);
        ctx.lineTo(Math.cos(a) * 204, Math.sin(a) * 204);
      }
      ctx.strokeStyle = rgba(color, 0.3);
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 144; i += 12) {
        const a = (i / 144) * TAU;
        ctx.moveTo(Math.cos(a) * 190, Math.sin(a) * 190);
        ctx.lineTo(Math.cos(a) * 204, Math.sin(a) * 204);
      }
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = rgba(color, 0.7);
      ctx.stroke();
      ctx.restore();

      // ── circular readout text (cached bitmap) ──────────────
      const key = `${ringText}|${color.join(',')}`;
      if (!textCache || textCache.key !== key) {
        // Re-rasterise at most every few frames during colour transitions.
        if (!textCache || frame % 4 === 0)
          textCache = { key, img: renderTextRing(ringText, color, dpr * scale) };
      }
      ctx.save();
      ctx.rotate(rot.text);
      ctx.drawImage(textCache.img, -210, -210, 420, 420);
      ctx.restore();

      // ── heavy segmented ring ───────────────────────────────
      const seg = TAU / SEGMENTS;
      const gap = 0.035;
      const scanPos = ((rot.scan % TAU) + TAU) % TAU;
      ctx.lineWidth = 20;
      for (let i = 0; i < SEGMENTS; i++) {
        const a0 = rot.segs + i * seg + gap;
        const a1 = rot.segs + (i + 1) * seg - gap;
        let alpha = SEG_ALPHA[i] ?? 0.4;
        if (params.scanner > 0.01) {
          // Distance (in segments) behind the sweeping head; bright head, fading trail.
          const mid = ((((a0 + a1) / 2 - rot.segs) % TAU) + TAU) % TAU;
          const behind = (((scanPos - mid) % TAU) + TAU) % TAU;
          const trail = Math.max(0, 1 - behind / (seg * 4));
          const scanned = 0.12 + trail * 0.88;
          alpha = alpha * (1 - params.scanner) + scanned * params.scanner;
        }
        if (params.breathe > 0.01) alpha *= 1 - params.breathe * 0.12 * (1 + Math.sin(t * 1.6));
        ctx.strokeStyle = rgba(color, alpha);
        ctx.beginPath();
        ctx.arc(0, 0, 152, a0, a1);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(color, 0.15);
      ctx.beginPath();
      ctx.arc(0, 0, 168, 0, TAU);
      ctx.moveTo(136, 0);
      ctx.arc(0, 0, 136, 0, TAU);
      ctx.stroke();

      // ── progress arc (executing) ───────────────────────────
      if (params.progress > 0.01) {
        const head = rot.prog;
        const len = Math.PI * (0.35 + 0.25 * Math.sin(t * 1.7));
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = rgba(color, 0.95 * params.progress);
        ctx.beginPath();
        ctx.arc(0, 0, 177, head, head + len);
        ctx.stroke();
        ctx.lineWidth = 9;
        ctx.strokeStyle = rgba(color, 0.15 * params.progress);
        ctx.stroke();
        ctx.lineCap = 'butt';
      }

      // ── dashed ring ────────────────────────────────────────
      ctx.save();
      ctx.rotate(rot.dash);
      ctx.setLineDash([14, 9]);
      ctx.lineWidth = 5;
      ctx.strokeStyle = rgba(color, 0.85 - params.scanner * 0.35);
      ctx.beginPath();
      ctx.arc(0, 0, 116, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // ── ripples (listening) ────────────────────────────────
      if (!reducedMotion) {
        rippleClock += dt * params.ripple;
        if (params.ripple > 0.3 && rippleClock > 0.45) {
          rippleClock = 0;
          ripples.push(0);
        }
        for (let i = ripples.length - 1; i >= 0; i--) {
          const age = (ripples[i] ?? 0) + dt;
          ripples[i] = age;
          if (age > 1.6) {
            ripples.splice(i, 1);
            continue;
          }
          const k = age / 1.6;
          ctx.lineWidth = 3 * (1 - k) + 1;
          ctx.strokeStyle = rgba(
            color,
            (1 - k) * 0.85 * Math.max(params.ripple, 0.2) * (0.7 + level * 0.6),
          );
          ctx.beginPath();
          ctx.arc(0, 0, 100 + k * 90, 0, TAU);
          ctx.stroke();
        }
      }

      // ── waveform ring (speaking) ───────────────────────────
      if (params.wave > 0.01) {
        const N = 120;
        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
          const a = (i / N) * TAU;
          const n =
            Math.sin(a * 6 + t * 7) * 0.5 +
            Math.sin(a * 11 - t * 11) * 0.3 +
            Math.sin(a * 17 + t * 5) * 0.2;
          const r = 104 + params.wave * (2 + level * 12) * n;
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = rgba(color, 0.9 * params.wave);
        ctx.stroke();
      }

      // ── inner orb ──────────────────────────────────────────
      const breath = params.breathe * 0.12 * Math.sin(t * 1.6);
      const pulse = (params.wave + params.ripple * 0.6) * level * 0.35;
      const intensity = Math.max(0.05, params.orb + breath + pulse);
      const orbR = 100 * (1 + pulse * 0.12);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, orbR);
      g.addColorStop(0, rgba(color, 0.45 * intensity));
      g.addColorStop(0.6, rgba(color, 0.12 * intensity));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, orbR, 0, TAU);
      ctx.fill();

      ctx.lineWidth = 1.5;
      ctx.strokeStyle = rgba(color, 0.35 + 0.4 * intensity);
      ctx.beginPath();
      ctx.arc(0, 0, 98, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([1, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(color, 0.2);
      ctx.beginPath();
      ctx.arc(0, 0, 90, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    };

    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      frame++;
      if (frame % 60 === 0) colors = readColors(); // picks up runtime theme swaps
      const st = stateRef.current;
      const calm = st === 'idle' && settled(params, STATE_TARGETS.idle);
      if (calm && now - lastPaint < IDLE_FRAME_MS) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      lastPaint = now;
      paint(now, dt);
    };

    const start = (): void => {
      cancelAnimationFrame(raf);
      if (document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };

    if (reducedMotion) {
      draw.current = () => {
        colors = readColors();
        paint(performance.now(), 0);
      };
      draw.current();
    } else {
      draw.current = null;
      start();
      document.addEventListener('visibilitychange', start);
    }

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', start);
      draw.current = null;
    };
  }, [size.w, size.h, center.x, center.y, radius, ringText, reducedMotion, getLevel, themeKey]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />;
});
