import { memo, useEffect, useRef } from 'react';
import type { AssistantState } from '@shared/types';
import { avatarMotion, moodNow } from './avatarKit';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { voiceMood } from '@renderer/voice/providers';

/** The animated face: an original angular machine face drawn on canvas.
 *  Eyes glow, blink, follow the mouse and narrow while thinking; the jaw moves with the
 *  voice level while speaking; colour shifts amber while acting and red on a fault.
 *  Unit space: radius 210 around the centre (same as the rings). */

interface Props {
  size: { w: number; h: number };
  center: { x: number; y: number };
  radius: number;
  state: AssistantState;
  reducedMotion: boolean;
  getLevel: () => number;
  themeKey: string;
}

type RGB = [number, number, number];
type Pt = [number, number];

function readColors(
  el: Element = document.documentElement,
): Record<'accent' | 'amber' | 'alert', RGB> {
  const css = getComputedStyle(el);
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
  `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a))})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const ease = (cur: number, target: number, k: number): number => cur + (target - cur) * k;

/** Per-state targets the face eases toward. */
const TARGET: Record<
  AssistantState,
  { eye: number; glow: number; brow: number; spin: number; tone: 0 | 1 | 2 }
> = {
  idle: { eye: 1, glow: 0.75, brow: 0, spin: 0.05, tone: 0 },
  listening: { eye: 1.25, glow: 1, brow: -6, spin: 0.12, tone: 0 },
  thinking: { eye: 0.45, glow: 0.9, brow: 5, spin: 0.5, tone: 0 },
  speaking: { eye: 1, glow: 1, brow: 0, spin: 0.15, tone: 0 },
  executing: { eye: 0.8, glow: 1, brow: 3, spin: 0.35, tone: 1 },
  error: { eye: 0.7, glow: 0.8, brow: 9, spin: 0.02, tone: 2 },
};

const HEAD: Pt[] = [
  [-92, -158],
  [92, -158],
  [128, -112],
  [134, -40],
  [118, 30],
  [84, 102],
  [36, 146],
  [-36, 146],
  [-84, 102],
  [-118, 30],
  [-134, -40],
  [-128, -112],
];
const LEFT_EYE: Pt[] = [
  [-100, -50],
  [-26, -34],
  [-34, -16],
  [-92, -26],
];
const mirror = (p: Pt[]): Pt[] => p.map(([x, y]) => [-x, y] as Pt).reverse();
const RIGHT_EYE = mirror(LEFT_EYE);
const centroid = (p: Pt[]): Pt => [
  p.reduce((s, q) => s + q[0], 0) / p.length,
  p.reduce((s, q) => s + q[1], 0) / p.length,
];

function poly(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

export const CoreFace = memo(function CoreFace({
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
  // With reduced motion a still frame is drawn per state; otherwise the loop reads state live.
  const stillKey = reducedMotion ? state : null;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const px = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(size.w * px));
    canvas.height = Math.max(1, Math.round(size.h * px));
    const colors = readColors(canvas);

    // Animated values.
    const v = {
      eye: 1,
      glow: 0.7,
      brow: 0,
      spin: 0.05,
      tone: [...colors.accent] as RGB,
      jaw: 0,
      blink: 1,
      gx: 0,
      gy: 0,
      rot: 0,
      scan: 0,
      smile: 0,
      sad: 0,
    };
    let moodCheck = 0;
    let moodTarget = { smile: 0, sad: 0 };
    let nextBlink = performance.now() + 2500;
    let blinkStart = 0;
    let idleGaze: Pt = [0, 0];
    let nextGaze = performance.now() + 3000;
    let mouse: Pt | null = null;
    let mouseAt = 0;

    const onMove = (e: MouseEvent): void => {
      const r = canvas.getBoundingClientRect();
      const { center: c, radius: R } = live.current;
      mouse = [
        (e.clientX - r.left - c.x) / Math.max(R, 1),
        (e.clientY - r.top - c.y) / Math.max(R, 1),
      ];
      mouseAt = performance.now();
    };
    window.addEventListener('mousemove', onMove);

    let raf = 0;
    let last = performance.now();
    const frame = (now: number): void => {
      const dt = Math.min(0.1, (now - last) / 1000) * avatarMotion();
      last = now;
      const {
        state: st,
        reducedMotion: still,
        getLevel: level,
        center: c,
        radius: R,
      } = live.current;
      const t = TARGET[st];
      const k = still ? 1 : 1 - Math.exp(-dt * 8);
      v.eye = ease(v.eye, t.eye, k);
      v.glow = ease(v.glow, t.glow, k);
      v.brow = ease(v.brow, t.brow, k);
      v.spin = ease(v.spin, t.spin, k);
      const toneTarget = t.tone === 1 ? colors.amber : t.tone === 2 ? colors.alert : colors.accent;
      v.tone = mix(v.tone, toneTarget, k);
      const lvl = st === 'speaking' ? Math.min(1, Math.max(0, level()) * 1.6) : 0;
      v.jaw = ease(v.jaw, lvl, still ? 1 : 1 - Math.exp(-dt * 22));
      // Mood from the latest reply: pleased, or sorry. Fades after ~10 s.
      if (now - moodCheck > 500) {
        moodCheck = now;
        const last = [...useConversationStore.getState().messages]
          .reverse()
          .find((m) => m.role === 'assistant');
        const fresh = last && Date.now() - last.timestamp < 10_000;
        const mood = fresh && last ? voiceMood(last.text) : 'neutral';
        const md = moodNow();
        moodTarget = {
          smile: mood === 'excited' || md.pleased > 0.2 ? 1 : 0,
          sad: mood === 'sorry' || st === 'error' ? 1 : 0,
        };
      }
      v.smile = ease(v.smile, moodTarget.smile, still ? 1 : 1 - Math.exp(-dt * 3));
      v.sad = ease(v.sad, moodTarget.sad, still ? 1 : 1 - Math.exp(-dt * 3));

      // Blink every few seconds (a double blink now and then).
      if (!still) {
        if (now > nextBlink && !blinkStart) blinkStart = now;
        if (blinkStart) {
          const p = (now - blinkStart) / 160;
          v.blink = p < 0.5 ? 1 - p * 2 : Math.min(1, (p - 0.5) * 2);
          if (p >= 1) {
            blinkStart = 0;
            v.blink = 1;
            nextBlink = now + (Math.random() < 0.2 ? 220 : 2500 + Math.random() * 4000);
          }
        }
        // Look at the pointer when it moves; otherwise glance around.
        if (now > nextGaze) {
          idleGaze = [(Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 0.7];
          nextGaze = now + 1800 + Math.random() * 3500;
        }
        const recent = mouse && now - mouseAt < 4000;
        const [tx, ty] =
          st === 'thinking'
            ? [Math.sin(now / 380) * 0.9, -0.35]
            : recent && mouse
              ? mouse
              : idleGaze;
        v.gx = ease(v.gx, Math.max(-1, Math.min(1, tx)), 1 - Math.exp(-dt * 6));
        v.gy = ease(v.gy, Math.max(-1, Math.min(1, ty)), 1 - Math.exp(-dt * 6));
        v.rot += dt * v.spin;
        v.scan = (v.scan + dt * 1.6) % 2;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const s = (R / 210) * px;
      ctx.setTransform(s, 0, 0, s, c.x * px, c.y * px);
      const col = v.tone;
      const breathe = still ? 1 : 0.85 + Math.sin(now / 1400) * 0.15;
      const err = st === 'error' && !still ? (Math.sin(now / 45) > 0.4 ? 0.4 : 1) : 1;

      // Outer ring with rotating segments.
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(col, 0.25);
      ctx.beginPath();
      ctx.arc(0, 0, 200, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const a = v.rot + (i * Math.PI) / 3;
        ctx.strokeStyle = rgba(col, i % 2 ? 0.25 : 0.6);
        ctx.beginPath();
        ctx.arc(0, 0, 192, a, a + 0.42);
        ctx.stroke();
      }

      // Head: dark plate, bright edge, seams.
      ctx.save();
      const tilt = still ? 0 : v.gx * 0.04 + (st === 'listening' ? Math.sin(now / 900) * 0.02 : 0);
      ctx.rotate(tilt);
      ctx.translate(v.gx * 4, v.gy * 3);
      poly(ctx, HEAD);
      const g = ctx.createLinearGradient(0, -160, 0, 150);
      g.addColorStop(0, rgba(col, 0.1));
      g.addColorStop(1, rgba(col, 0.02));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(col, 0.75 * breathe);
      ctx.shadowColor = rgba(col, 0.6);
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(col, 0.3);
      ctx.beginPath();
      // forehead plate, centre ridge, cheek seams
      ctx.moveTo(-70, -158);
      ctx.lineTo(-48, -110);
      ctx.lineTo(48, -110);
      ctx.lineTo(70, -158);
      ctx.moveTo(0, -110);
      ctx.lineTo(0, -60);
      ctx.moveTo(-96, -24);
      ctx.lineTo(-74, 52);
      ctx.lineTo(-84, 102);
      ctx.moveTo(96, -24);
      ctx.lineTo(74, 52);
      ctx.lineTo(84, 102);
      ctx.moveTo(-14, -6);
      ctx.lineTo(0, 26);
      ctx.lineTo(14, -6);
      ctx.stroke();

      // Brows angle down toward the centre (more so when concentrating or faulting).
      ctx.lineWidth = 3;
      ctx.strokeStyle = rgba(col, 0.85);
      ctx.beginPath();
      // Confused: one brow up, one down.
      const puzzled = moodNow().confused * 14;
      ctx.moveTo(-112, -74 + v.brow * 0.3 + v.sad * 6 - puzzled);
      ctx.lineTo(-22, -54 + v.brow - v.sad * 14 - puzzled);
      ctx.moveTo(112, -74 + v.brow * 0.3 + v.sad * 6 + puzzled * 0.4);
      ctx.lineTo(22, -54 + v.brow - v.sad * 14 + puzzled * 0.6);
      ctx.stroke();

      // Eyes.
      const open = Math.max(0.06, v.eye * v.blink);
      for (const eye of [LEFT_EYE, RIGHT_EYE]) {
        const [ex, ey] = centroid(eye);
        ctx.save();
        ctx.translate(ex, ey);
        ctx.scale(1, open);
        ctx.translate(-ex, -ey);
        poly(ctx, eye);
        ctx.fillStyle = rgba(col, 0.28 * v.glow * err);
        ctx.shadowColor = rgba(col, 0.9);
        ctx.shadowBlur = 22 * v.glow * err;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = rgba(col, 0.9 * err);
        ctx.stroke();
        // The bright core looks where the face is looking.
        ctx.clip();
        const px2 = ex + v.gx * 22;
        const py2 = ey + v.gy * 6;
        const core = ctx.createRadialGradient(px2, py2, 0, px2, py2, 20);
        core.addColorStop(0, rgba([255, 255, 255], 0.95 * err));
        core.addColorStop(0.35, rgba(col, 0.9 * v.glow * err));
        core.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = core;
        ctx.fillRect(ex - 60, ey - 30, 120, 60);
        if (st === 'thinking' && !still) {
          const sx = ex - 40 + (v.scan < 1 ? v.scan : 2 - v.scan) * 80;
          ctx.fillStyle = rgba([255, 255, 255], 0.5);
          ctx.fillRect(sx - 2, ey - 30, 4, 60);
        }
        ctx.restore();
      }

      // Mouth: a slit with grille bars; the jaw drops with the voice.
      const drop = 3 + v.jaw * 26;
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(col, 0.85);
      ctx.beginPath();
      const corner = 72 - v.smile * 9 + v.sad * 10;
      ctx.moveTo(-58, corner);
      ctx.lineTo(-20, 78 + v.smile * 2);
      ctx.lineTo(20, 78 + v.smile * 2);
      ctx.lineTo(58, corner);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-50, 76 + drop * 0.6);
      ctx.lineTo(-18, 80 + drop);
      ctx.lineTo(18, 80 + drop);
      ctx.lineTo(50, 76 + drop * 0.6);
      ctx.stroke();
      ctx.fillStyle = rgba(col, 0.12 + v.jaw * 0.35);
      ctx.beginPath();
      ctx.moveTo(-50, 74);
      ctx.lineTo(50, 74);
      ctx.lineTo(50, 76 + drop * 0.6);
      ctx.lineTo(18, 80 + drop);
      ctx.lineTo(-18, 80 + drop);
      ctx.lineTo(-50, 76 + drop * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(col, 0.35 + v.jaw * 0.5);
      ctx.beginPath();
      for (let x = -40; x <= 40; x += 10) {
        ctx.moveTo(x, 77);
        ctx.lineTo(x, 77 + drop * (1 - Math.abs(x) / 70));
      }
      ctx.stroke();
      // Chin plate follows the jaw.
      ctx.strokeStyle = rgba(col, 0.4);
      ctx.beginPath();
      ctx.moveTo(-36, 118 + v.jaw * 10);
      ctx.lineTo(0, 130 + v.jaw * 10);
      ctx.lineTo(36, 118 + v.jaw * 10);
      ctx.stroke();
      ctx.restore();

      if (still) return; // one frame per change with reduced motion
      if (!document.hidden) raf = requestAnimationFrame(frame);
    };

    const onVis = (): void => {
      if (!document.hidden && !live.current.reducedMotion) {
        cancelAnimationFrame(raf);
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('visibilitychange', onVis);
    };
    // Re-run on size/theme changes, and on state changes when motion is reduced.
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
