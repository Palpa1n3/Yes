import type { AssistantState } from '@shared/types';
import { avatarMotion, moodNow } from './avatarKit';
import type { LiveAvatar } from './avatarKit';

/** The data sphere: an original avatar of a slowly turning 3D globe of glowing light —
 *  arcs of "circuitry" on nested shells, drifting sparks, tilted orbit rings and a swirling
 *  core, drawn with additive light so overlaps glow. Gold by default; it spins up and throws
 *  sparks while thinking, pulses with the voice while speaking, brightens while listening,
 *  turns orange while acting and red (flickering) on a fault.
 *  Unit space: radius 210 around the centre (same as the other avatars). */

type RGB = [number, number, number];
type V3 = [number, number, number];

const GOLD: RGB = [255, 186, 72];
const HOT: RGB = [255, 238, 180];
const ORANGE: RGB = [255, 128, 40];
const PALETTES = {
  sphere: { base: GOLD, hot: HOT },
  cloud: { base: [60, 196, 255] as RGB, hot: [205, 246, 255] as RGB },
};
const RED: RGB = [255, 70, 80];

const rgba = (c: RGB, a: number): string =>
  `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a))})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const ease = (cur: number, target: number, k: number): number => cur + (target - cur) * k;

function randUnit(): V3 {
  const z = Math.random() * 2 - 1;
  const t = Math.random() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return [r * Math.cos(t), r * Math.sin(t), z];
}
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function norm(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
/** Two unit vectors at right angles to `n` (and each other). */
function basis(n: V3): [V3, V3] {
  const helper: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = norm(cross(n, helper));
  return [u, cross(n, u)];
}

interface Arc {
  u: V3;
  v: V3;
  r: number;
  t0: number;
  len: number;
  w: number;
  width: number;
  bright: number;
}
interface Spark {
  p: V3;
  r: number;
  w: number;
}
interface Flare {
  p: V3;
  life: number;
}

/** Per-state targets. */
const TARGET: Record<
  AssistantState,
  { spin: number; glow: number; sparks: number; tone: 0 | 1 | 2 }
> = {
  idle: { spin: 0.18, glow: 0.75, sparks: 1, tone: 0 },
  listening: { spin: 0.22, glow: 1.05, sparks: 2, tone: 0 },
  thinking: { spin: 0.85, glow: 0.95, sparks: 9, tone: 0 },
  speaking: { spin: 0.3, glow: 1, sparks: 3, tone: 0 },
  executing: { spin: 0.6, glow: 1, sparks: 5, tone: 1 },
  error: { spin: 0.06, glow: 0.7, sparks: 0.5, tone: 2 },
};

/** Draws the avatar on the canvas until the returned function is called. Framework-free, so
 *  the phone app uses it too. */
export function runSphere(
  canvas: HTMLCanvasElement,
  size: { w: number; h: number },
  live: { current: LiveAvatar },
  variant: 'sphere' | 'cloud' = 'sphere',
): () => void {
  const ctx = canvas?.getContext('2d');
  if (!ctx) return () => undefined;
  const px = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(size.w * px));
  canvas.height = Math.max(1, Math.round(size.h * px));
  const cloud = variant === 'cloud';
  const custom = getComputedStyle(canvas).getPropertyValue('--avatar-color').trim();
  const cc = custom.split(/\s+/).map(Number);
  const pal =
    cc.length === 3 && cc.every((n) => Number.isFinite(n))
      ? { base: cc as RGB, hot: mix(cc as RGB, [255, 255, 255], 0.6) }
      : PALETTES[variant];

  // Circuit arcs on nested shells: most near the surface, some deeper inside.
  const arcs: Arc[] = Array.from({ length: cloud ? 300 : 210 }, (_, i) => {
    const [u, v] = basis(randUnit());
    const deep = i % 4 === 0;
    return {
      u,
      v,
      r: deep ? 0.35 + Math.random() * 0.4 : 0.82 + Math.random() * 0.18,
      t0: Math.random() * Math.PI * 2,
      len: 0.15 + Math.random() * (deep ? 1.2 : 0.7),
      // Each line runs round its own circle, either way, at its own speed.
      w: (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 1.3),
      width: Math.random() < 0.2 ? 2.2 : 1.2,
      bright: 0.4 + Math.random() * 0.6,
    };
  });
  const sparks: Spark[] = Array.from({ length: cloud ? 900 : 700 }, () => ({
    p: randUnit(),
    r: Math.random() < 0.75 ? 0.85 + Math.random() * 0.2 : 0.2 + Math.random() * 0.6,
    w: 0.2 + Math.random() * 0.8,
  }));
  // Tilted orbit rings around the globe.
  const orbits = [
    { n: norm([0.25, 1, 0.15] as V3), r: 1.12, gap: 0.6 },
    { n: norm([1, 0.35, -0.4] as V3), r: 1.2, gap: 1.4 },
    { n: norm([-0.5, 0.6, 1] as V3), r: 1.05, gap: 2.2 },
  ].map((o) => ({ ...o, b: basis(o.n) }));
  const flares: Flare[] = [];
  // Light streaks from the core out to the shell.
  const rays = Array.from({ length: 46 }, () => ({
    d: randUnit(),
    from: 0.15 + Math.random() * 0.25,
    to: 0.6 + Math.random() * 0.45,
    a: 0.3 + Math.random() * 0.7,
  }));

  const v = {
    yaw: Math.random() * Math.PI * 2,
    spin: 0.18,
    glow: 0.75,
    sparks: 1,
    level: 0,
    tone: [...pal.base] as RGB,
    t: 0,
  };

  let raf = 0;
  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000) * avatarMotion();
    last = now;
    const { state: st, reducedMotion: still, getLevel: level, center: c, radius: R } = live.current;
    const tg = TARGET[st];
    const k = still ? 1 : 1 - Math.exp(-dt * 5);
    v.spin = ease(v.spin, tg.spin, k);
    v.glow = ease(v.glow, tg.glow, k);
    v.sparks = ease(v.sparks, tg.sparks, k);
    v.tone = mix(v.tone, tg.tone === 1 ? ORANGE : tg.tone === 2 ? RED : pal.base, k);
    const lvl = st === 'speaking' || st === 'idle' ? Math.min(1, Math.max(0, level()) * 1.6) : 0;
    const md = moodNow();
    v.level = ease(v.level, lvl, still ? 1 : 1 - Math.exp(-dt * 16));
    if (!still) {
      v.yaw += v.spin * dt;
      v.t += dt;
      // Always moving; faster while thinking or acting.
      for (const a of arcs) a.t0 += a.w * (0.45 + v.spin * 1.6) * dt;
      // Sparks flare up at random spots on the surface.
      if (Math.random() < dt * v.sparks * 3 && flares.length < 24)
        flares.push({ p: randUnit(), life: 1 });
      for (const f of flares) f.life -= dt * 1.4;
      for (let i = flares.length - 1; i >= 0; i--)
        if ((flares[i]?.life ?? 0) <= 0) flares.splice(i, 1);
    }

    ctx.setTransform(px, 0, 0, px, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const s = R / 210;
    const flicker = st === 'error' && !still ? 0.75 + Math.random() * 0.25 : 1;
    const S = 165 * (1 + v.level * 0.07 + Math.sin(v.t * 1.3) * 0.01);
    const cy = Math.cos(v.yaw);
    const sy = Math.sin(v.yaw);
    const tilt = 0.32 + Math.sin(v.t * 0.21) * 0.06;
    const cx = Math.cos(tilt);
    const sx = Math.sin(tilt);
    /** Rotate (yaw then tilt), then perspective. Returns screen x, y and depth 0..1. */
    const proj = (p: V3, r: number): [number, number, number] => {
      // The cloud is lumpy and slowly changes shape; the sphere stays round.
      const lump = cloud
        ? 1 +
          0.2 * Math.sin(p[0] * 3 + v.t * 0.6) * Math.cos(p[1] * 2 - v.t * 0.45) +
          0.14 * Math.sin(p[2] * 4 + p[0] * 2 + v.t * 0.8) +
          0.08 * Math.sin(p[1] * 6 + v.t * 1.2)
        : 1;
      const x = p[0] * r * lump * (cloud ? 1.28 : 1);
      const y = p[1] * r * lump * (cloud ? 0.86 : 1);
      const z = p[2] * r * lump;
      const x1 = x * cy + z * sy;
      const z1 = -x * sy + z * cy;
      const y2 = y * cx - z1 * sx;
      const z2 = y * sx + z1 * cx;
      const f = 700 / (700 - z2 * S);
      return [x1 * S * f, y2 * S * f, (z2 + 1.25) / 2.5];
    };

    ctx.save();
    ctx.translate(c.x + Math.sin(v.t * 14) * 5 * md.confused, c.y);
    ctx.scale(s, s);
    ctx.globalCompositeOperation = 'lighter';
    const col = v.tone;
    const g = v.glow * flicker * (1 + md.pleased * 0.5);

    // Soft halo and the bright core.
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, S * 1.25);
    halo.addColorStop(0, rgba(col, 0.32 * g + v.level * 0.15));
    halo.addColorStop(0.55, rgba(col, 0.11 * g));
    halo.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, S * 1.25, 0, Math.PI * 2);
    ctx.fill();
    const coreR = 28 + v.level * 18;
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR * 2.2);
    core.addColorStop(0, rgba(pal.hot, 0.9 * g));
    core.addColorStop(0.3, rgba(col, 0.5 * g));
    core.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, coreR * 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Swirl in the core: a few spiral strands turning faster than the globe.
    ctx.lineWidth = 1.4;
    for (let k2 = 0; k2 < (cloud ? 0 : 3); k2++) {
      ctx.strokeStyle = rgba(pal.hot, 0.45 * g);
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const a = v.t * (1.2 + v.spin * 2) + k2 * 2.1 + t * 4.2;
        const rr = (10 + t * 46) * (1 + v.level * 0.4);
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr * 0.62;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }

    // Circuit arcs: a wide faint glow pass, then the bright line, brighter at the front.
    for (const a of arcs) {
      const steps = Math.max(4, Math.round(a.len * 10));
      const pts: Array<[number, number, number]> = [];
      for (let i = 0; i <= steps; i++) {
        const t = a.t0 + (i / steps) * a.len;
        const ct = Math.cos(t);
        const st2 = Math.sin(t);
        pts.push(
          proj(
            [a.u[0] * ct + a.v[0] * st2, a.u[1] * ct + a.v[1] * st2, a.u[2] * ct + a.v[2] * st2],
            a.r,
          ),
        );
      }
      const depth = pts.reduce((n, q) => n + q[2], 0) / pts.length;
      const tone = depth > 0.55 ? mix(col, pal.hot, Math.min(1, (depth - 0.55) * 1.6)) : col;
      const alpha = (0.16 + depth * 0.8) * a.bright * g;
      ctx.beginPath();
      pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
      ctx.strokeStyle = rgba(col, alpha * 0.22);
      ctx.lineWidth = a.width * 4;
      ctx.stroke();
      ctx.strokeStyle = rgba(tone, alpha);
      ctx.lineWidth = a.width * (0.6 + depth * 0.9);
      ctx.stroke();
      const end = pts[pts.length - 1];
      if (a.width > 2 && end) {
        ctx.fillStyle = rgba(pal.hot, (0.4 + end[2] * 0.6) * g);
        ctx.fillRect(end[0] - 1.8, end[1] - 1.8, 3.6, 3.6);
      }
    }

    // Light streaks from the core.
    ctx.lineWidth = 1;
    for (const ray of rays) {
      const a0 = proj(ray.d, ray.from);
      const a1 = proj(ray.d, ray.to);
      const lg = ctx.createLinearGradient(a0[0], a0[1], a1[0], a1[1]);
      lg.addColorStop(0, rgba(pal.hot, 0.32 * ray.a * g * (0.5 + a1[2])));
      lg.addColorStop(1, rgba(col, 0));
      ctx.strokeStyle = lg;
      ctx.beginPath();
      ctx.moveTo(a0[0], a0[1]);
      ctx.lineTo(a1[0], a1[1]);
      ctx.stroke();
    }

    // Sparks: tiny streaks drifting round the globe.
    for (const sp of sparks) {
      const q = proj(sp.p, sp.r);
      const len = 2 + sp.w * 5 * v.spin * 4;
      ctx.strokeStyle = rgba(q[2] > 0.65 ? pal.hot : col, (0.1 + q[2] * 0.85) * g);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(q[0], q[1]);
      ctx.lineTo(q[0] - len * cy, q[1] - len * 0.15);
      ctx.stroke();
    }

    // Orbit rings (broken), slightly outside the globe.
    for (const o of cloud ? [] : orbits) {
      const [u, w] = o.b;
      let prev: [number, number, number] | null = null;
      for (let i = 0; i <= 90; i++) {
        const t = (i / 90) * Math.PI * 2 + v.t * (0.5 + v.spin);
        if ((t + o.gap) % (Math.PI * 2) < 0.7) {
          prev = null;
          continue;
        }
        const p: V3 = [
          u[0] * Math.cos(t) + w[0] * Math.sin(t),
          u[1] * Math.cos(t) + w[1] * Math.sin(t),
          u[2] * Math.cos(t) + w[2] * Math.sin(t),
        ];
        const q = proj(p, o.r);
        if (prev) {
          ctx.strokeStyle = rgba(col, (0.1 + q[2] * 0.5) * g);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(prev[0], prev[1]);
          ctx.lineTo(q[0], q[1]);
          ctx.stroke();
        }
        prev = q;
      }
    }

    // Flares: bright bursts on the surface (more while thinking or speaking).
    for (const f of flares) {
      const q = proj(f.p, 1.0);
      if (q[2] < 0.45) continue;
      const r = 6 + (1 - f.life) * 16;
      const fg = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], r);
      fg.addColorStop(0, rgba(pal.hot, f.life * 0.8 * g));
      fg.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(q[0], q[1], r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (still) return;
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
    document.removeEventListener('visibilitychange', onVis);
  };
}
