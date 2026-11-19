/** Four more avatars, drawn on canvas without React (so the phone app can use them too):
 *  a sound-wave line, a particle swarm, a liquid orb and a 3D wireframe head. All original.
 *  Unit space: radius 210 around the centre, like the other avatars. */
import { avatarMotion, cssRgb, ease, mix, moodNow, rgba, type RGB } from './avatarKit';

export type EngineName = 'wave' | 'swarm' | 'orb' | 'head';
type St = 'idle' | 'listening' | 'thinking' | 'speaking' | 'executing' | 'error';

export interface AvatarIO {
  state(): string;
  /** Voice level while speaking, music level while idle (0–1). */
  level(): number;
  center(): { x: number; y: number };
  radius(): number;
  reduced(): boolean;
}

interface Frame {
  ctx: CanvasRenderingContext2D;
  t: number;
  dt: number;
  st: St;
  lvl: number;
  spin: number;
  col: RGB;
  hot: RGB;
  glow: number;
  pleased: number;
  confused: number;
}

const SPIN: Record<St, number> = {
  idle: 0.25,
  listening: 0.35,
  thinking: 1.4,
  speaking: 0.5,
  executing: 1,
  error: 0.05,
};
const GREEN: RGB = [90, 235, 160];

/* ── Engines ── */

function wave(f: Frame): void {
  const { ctx, t, lvl, col, hot, glow } = f;
  const think = f.st === 'thinking' || f.st === 'executing' ? 1 : 0;
  const listen = f.st === 'listening' ? 1 : 0;
  ctx.strokeStyle = rgba(col, 0.12);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 200, 0, Math.PI * 2);
  ctx.stroke();
  for (let layer = 0; layer < 3; layer++) {
    const amp = (10 + lvl * 85 + listen * 22 + think * 18) * (1 - layer * 0.28);
    const freq = 0.028 + layer * 0.011 + think * 0.01;
    const speed = (1.6 + layer * 0.7) * (1 + think * 1.5);
    const pts: Array<[number, number]> = [];
    for (let x = -200; x <= 200; x += 4) {
      const env = Math.pow(Math.max(0, 1 - (x / 200) ** 2), 1.4);
      const y =
        (Math.sin(x * freq + t * speed + layer) * 0.7 +
          Math.sin(x * freq * 2.3 - t * speed * 0.7) * 0.3 +
          (think ? Math.sin(x * 0.11 + t * 9) * 0.25 : 0)) *
        amp *
        env;
      pts.push([x, y]);
    }
    const c = layer === 0 ? mix(col, hot, 0.3 + lvl * 0.5) : col;
    for (const [w, a] of [
      [7, 0.08],
      [2.2 - layer * 0.5, 0.75 - layer * 0.2],
    ] as const) {
      ctx.strokeStyle = rgba(c, a * glow);
      ctx.lineWidth = w;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
  }
}

interface SwarmMem {
  ps: Array<{ inc: number; ph: number; r: number; sp: number; size: number }>;
  rot: number;
  pulse: number;
}
function swarm(f: Frame, m: SwarmMem): void {
  const { ctx, t, dt, lvl, col, hot, glow } = f;
  m.rot += dt * f.spin * 0.6;
  const target =
    f.st === 'listening' ? 0.78 : f.st === 'thinking' ? 0.9 + Math.sin(t * 3) * 0.08 : 1;
  m.pulse = ease(m.pulse, target + lvl * 0.35, 1 - Math.exp(-dt * 6));
  for (const p of m.ps) {
    p.ph += dt * p.sp * (0.4 + f.spin);
    const r = p.r * m.pulse;
    const x0 = Math.cos(p.ph) * r;
    const y0 = Math.sin(p.ph) * r * Math.cos(p.inc);
    const z0 = Math.sin(p.ph) * r * Math.sin(p.inc);
    const x = x0 * Math.cos(m.rot) + z0 * Math.sin(m.rot);
    const z = -x0 * Math.sin(m.rot) + z0 * Math.cos(m.rot);
    const depth = (z / 170 + 1) / 2;
    ctx.fillStyle = rgba(depth > 0.7 ? hot : col, (0.15 + depth * 0.75) * glow);
    const s = p.size * (0.6 + depth * 0.8);
    ctx.fillRect(x - s / 2, y0 - s / 2, s, s);
  }
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 70 + lvl * 30);
  core.addColorStop(0, rgba(hot, 0.35 * glow));
  core.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, 70 + lvl * 30, 0, Math.PI * 2);
  ctx.fill();
}

interface OrbMem {
  wob: number;
}
function orb(f: Frame, m: OrbMem): void {
  const { ctx, t, dt, lvl, col, hot, glow } = f;
  const think = f.st === 'thinking' || f.st === 'executing';
  m.wob = ease(m.wob, (think ? 0.09 : 0.04) + lvl * 0.14, 1 - Math.exp(-dt * 5));
  const blob = (base: number, k: number, phase: number): void => {
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const r =
        base *
        (1 +
          m.wob *
            (Math.sin(a * 3 + t * (1.1 + k) + phase) * 0.6 +
              Math.sin(a * 5 - t * (1.7 + k)) * 0.3 +
              Math.sin(a * 2 + t * 0.6) * 0.4));
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
  };
  const R = 135 * (1 + lvl * 0.08);
  const g = ctx.createRadialGradient(-R * 0.25, -R * 0.3, R * 0.05, 0, 0, R * 1.1);
  g.addColorStop(0, rgba(hot, 0.85 * glow));
  g.addColorStop(0.35, rgba(col, 0.55 * glow));
  g.addColorStop(1, rgba(col, 0.05));
  blob(R, 0, 0);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = rgba(hot, 0.6 * glow);
  ctx.lineWidth = 2;
  ctx.stroke();
  // Inner currents.
  for (let k = 1; k <= 2; k++) {
    blob(R * (0.55 - k * 0.12), k, k * 2);
    ctx.strokeStyle = rgba(hot, 0.25 * glow);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  // Highlight.
  ctx.fillStyle = rgba([255, 255, 255], 0.18 * glow);
  ctx.beginPath();
  ctx.ellipse(-R * 0.35, -R * 0.42, R * 0.22, R * 0.1, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

interface HeadMem {
  yaw: number;
  jaw: number;
}
/** A head-shaped grid: rounder skull, narrower jaw, a nose and brow ridge at the front. */
function headPoint(u: number, v: number, jaw: number): [number, number, number] {
  // u: 0 (top) .. π (chin); v: angle round the head (0 = facing us).
  const lower = Math.max(0, (u - 1.7) / 1.44);
  const width = 1 - lower * lower * 0.55;
  // Rounder skull on top, flatter cheeks, narrower jaw and chin.
  const skull = u < 1.2 ? 1 + (1.2 - u) * 0.06 : 1;
  let x = Math.sin(u) * Math.sin(v) * 122 * width * skull;
  let y = -Math.cos(u) * (u < Math.PI / 2 ? 132 : 150);
  let z = Math.sin(u) * Math.cos(v) * 118 * width;
  const front = Math.max(0, Math.cos(v));
  // Nose and brow ridge.
  const nose = Math.exp(-(((u - 1.75) / 0.22) ** 2) - (v / 0.16) ** 2) * 26;
  const brow = Math.exp(-(((u - 1.38) / 0.1) ** 2)) * front ** 4 * 10;
  z += nose + brow;
  // Mouth area opens with the jaw.
  if (u > 2.15) y += jaw * 18 * (u - 2.15);
  x *= 1 + Math.exp(-(((u - 1.6) / 0.25) ** 2)) * 0.04;
  return [x, y, z];
}
function head(f: Frame, m: HeadMem): void {
  const { ctx, t, dt, lvl, col, hot, glow } = f;
  const swing = f.st === 'thinking' ? 0.9 : f.st === 'listening' ? 0.25 : 0.55;
  m.yaw = Math.sin(t * 0.35 * (0.4 + f.spin)) * swing + Math.sin(t * 0.13) * 0.2;
  m.jaw = ease(m.jaw, f.st === 'speaking' ? lvl : 0, 1 - Math.exp(-dt * 18));
  const cy = Math.cos(m.yaw);
  const sy = Math.sin(m.yaw);
  const tilt = f.confused * 0.18 * Math.sin(t * 6);
  const proj = (p: [number, number, number]): [number, number, number] => {
    const x = p[0] * cy + p[2] * sy;
    const z = -p[0] * sy + p[2] * cy;
    const y = p[1] * Math.cos(tilt) - x * Math.sin(tilt) * 0.3;
    const k = 600 / (600 - z);
    return [x * k, y * k + 10, (z / 150 + 1) / 2];
  };
  const line = (pts: Array<[number, number, number]>): void => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (!a || !b) continue;
      const d = (a[2] + b[2]) / 2;
      ctx.strokeStyle = rgba(
        d > 0.62 ? mix(col, hot, (d - 0.62) * 2) : col,
        (0.05 + d * 0.6) * glow,
      );
      ctx.lineWidth = 0.6 + d * 1.1;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
  };
  for (let i = 1; i < 16; i++) {
    const u = (i / 16) * Math.PI;
    const ring: Array<[number, number, number]> = [];
    for (let j = 0; j <= 48; j++) ring.push(proj(headPoint(u, (j / 48) * Math.PI * 2, m.jaw)));
    line(ring);
  }
  for (let j = 0; j < 24; j++) {
    const v = (j / 24) * Math.PI * 2;
    const mer: Array<[number, number, number]> = [];
    for (let i = 0; i <= 24; i++) mer.push(proj(headPoint((i / 24) * Math.PI, v, m.jaw)));
    line(mer);
  }
  // Eyes.
  for (const side of [-1, 1]) {
    const e = proj(headPoint(1.55, side * 0.42, 0));
    if (e[2] < 0.5) continue;
    const r = 5 + f.glow * 2 + (f.st === 'listening' ? 2 : 0);
    const g = ctx.createRadialGradient(e[0], e[1], 0, e[0], e[1], r * 3);
    g.addColorStop(0, rgba(hot, 0.95 * glow));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(e[0], e[1], r * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ── Runner ── */

/** Start an engine on a canvas (sized by its CSS box). Returns a stop function. */
export function runAvatar(canvas: HTMLCanvasElement, name: EngineName, io: AvatarIO): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;
  const px = window.devicePixelRatio || 1;
  const fit = (): void => {
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * px));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * px));
  };
  fit();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
  ro?.observe(canvas);
  const mem: Record<EngineName, unknown> = {
    wave: {},
    swarm: {
      rot: 0,
      pulse: 1,
      ps: Array.from({ length: 520 }, () => ({
        inc: Math.random() * Math.PI,
        ph: Math.random() * Math.PI * 2,
        r: 110 + Math.random() * 70,
        sp: (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.9),
        size: 1.2 + Math.random() * 2.2,
      })),
    } satisfies SwarmMem,
    orb: { wob: 0.04 } satisfies OrbMem,
    head: { yaw: 0, jaw: 0 } satisfies HeadMem,
  };
  const v = { glow: 0.8, tone: [63, 208, 255] as RGB, lvl: 0, spin: 0.25 };
  let t = 0;
  let last = performance.now();
  let raf = 0;
  let colorsAt = -Infinity;
  let colors = { accent: v.tone, amber: [255, 181, 71] as RGB, alert: [255, 77, 94] as RGB };
  const frame = (now: number): void => {
    const still = io.reduced();
    const dt = Math.min(0.1, (now - last) / 1000) * avatarMotion();
    last = now;
    if (!still) t += dt;
    if (now - colorsAt > 2000) {
      colorsAt = now;
      colors = {
        accent: cssRgb(canvas, '--accent', colors.accent),
        amber: cssRgb(canvas, '--amber', colors.amber),
        alert: cssRgb(canvas, '--alert', colors.alert),
      };
    }
    const st = (io.state() as St) in SPIN ? (io.state() as St) : 'idle';
    const k = still ? 1 : 1 - Math.exp(-dt * 5);
    const md = moodNow();
    v.spin = ease(v.spin, SPIN[st], k);
    v.glow = ease(v.glow, (st === 'error' ? 0.75 : st === 'idle' ? 0.85 : 1) + md.pleased * 0.4, k);
    let tone = st === 'executing' ? colors.amber : st === 'error' ? colors.alert : colors.accent;
    if (md.pleased) tone = mix(tone, GREEN, md.pleased * 0.6);
    if (md.confused) tone = mix(tone, colors.amber, md.confused * 0.5);
    v.tone = mix(v.tone, tone, k);
    const raw = st === 'speaking' || st === 'idle' ? Math.min(1, Math.max(0, io.level()) * 1.6) : 0;
    v.lvl = ease(v.lvl, raw, still ? 1 : 1 - Math.exp(-dt * 16));

    const { x, y } = io.center();
    const s = io.radius() / 210;
    ctx.setTransform(px, 0, 0, px, 0, 0);
    ctx.clearRect(0, 0, canvas.width / px, canvas.height / px);
    ctx.save();
    const wobble = md.confused ? Math.sin(t * 14) * 4 * md.confused : 0;
    ctx.translate(x + wobble, y);
    ctx.scale(s, s);
    ctx.globalCompositeOperation = 'lighter';
    const f: Frame = {
      ctx,
      t,
      dt: still ? 0 : dt,
      st,
      lvl: v.lvl,
      spin: v.spin,
      col: v.tone,
      hot: mix(v.tone, [255, 255, 255], 0.6),
      glow: v.glow,
      pleased: md.pleased,
      confused: md.confused,
    };
    if (name === 'wave') wave(f);
    else if (name === 'swarm') swarm(f, mem.swarm as SwarmMem);
    else if (name === 'orb') orb(f, mem.orb as OrbMem);
    else head(f, mem.head as HeadMem);
    ctx.restore();
    if (!document.hidden) raf = requestAnimationFrame(frame);
  };
  const onVis = (): void => {
    if (!document.hidden) {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  document.addEventListener('visibilitychange', onVis);
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    ro?.disconnect();
    document.removeEventListener('visibilitychange', onVis);
  };
}
