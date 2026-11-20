import type { AssistantState } from '@shared/types';
import { avatarMotion, moodNow } from './avatarKit';
import type { LiveAvatar } from './avatarKit';

/** The code ring: an original avatar of concentric rings made of scrolling code characters,
 *  turning in alternate directions around a glowing core. The characters keep rewriting
 *  themselves (fast while thinking), the rings breathe with the voice while speaking, a bright
 *  sweep runs round while listening; amber while acting, red and jittery on a fault.
 *  Unit space: radius 210 around the centre (same as the other avatars). */

type RGB = [number, number, number];

function readColors(
  el: Element = document.documentElement,
): Record<'accent' | 'amber' | 'alert' | 'ice', RGB> {
  const css = getComputedStyle(el);
  const parse = (name: string, fallback: RGB): RGB => {
    const parts = css.getPropertyValue(name).trim().split(/\s+/).map(Number);
    return parts.length === 3 && parts.every((n) => Number.isFinite(n)) ? (parts as RGB) : fallback;
  };
  return {
    accent: parse('--accent', [63, 208, 255]),
    amber: parse('--amber', [255, 181, 71]),
    alert: parse('--alert', [255, 77, 94]),
    ice: parse('--ice', [220, 244, 255]),
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

const GLYPHS = '0123456789ABCDEF{}[]<>/\\=+*#$%&;:01010110λΣΔΩ∆∑≡≠⊕⊗░▒';
const pick = (): string => GLYPHS[(Math.random() * GLYPHS.length) | 0] ?? '0';

interface Ring {
  r: number;
  size: number;
  dir: 1 | -1;
  speed: number;
  /** Glyph slots; '' marks a gap between segments. */
  glyphs: string[];
  /** Per-glyph brightness flicker. */
  bright: number[];
}

function makeRing(
  r: number,
  size: number,
  dir: 1 | -1,
  speed: number,
  seg: number,
  gap: number,
): Ring {
  const count = Math.floor((2 * Math.PI * r) / (size * 0.95));
  const glyphs: string[] = [];
  const bright: number[] = [];
  for (let i = 0; i < count; i++) {
    glyphs.push(i % seg >= seg - gap ? '' : pick());
    bright.push(Math.random());
  }
  return { r, size, dir, speed, glyphs, bright };
}

/** Per-state targets. */
const TARGET: Record<
  AssistantState,
  { spin: number; scramble: number; glow: number; sweep: number; tone: 0 | 1 | 2 }
> = {
  idle: { spin: 0.12, scramble: 4, glow: 0.7, sweep: 0, tone: 0 },
  listening: { spin: 0.18, scramble: 8, glow: 0.95, sweep: 1, tone: 0 },
  thinking: { spin: 0.75, scramble: 60, glow: 0.9, sweep: 0, tone: 0 },
  speaking: { spin: 0.25, scramble: 14, glow: 1, sweep: 0, tone: 0 },
  executing: { spin: 0.55, scramble: 30, glow: 1, sweep: 0, tone: 1 },
  error: { spin: 0.05, scramble: 2, glow: 0.8, sweep: 0, tone: 2 },
};

/** Draws the avatar on the canvas until the returned function is called. Framework-free, so
 *  the phone app uses it too. */
export function runCodeRing(
  canvas: HTMLCanvasElement,
  size: { w: number; h: number },
  live: { current: LiveAvatar },
): () => void {
  const ctx = canvas?.getContext('2d');
  if (!ctx) return () => undefined;
  const px = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(size.w * px));
  canvas.height = Math.max(1, Math.round(size.h * px));
  const colors = readColors(canvas);

  const rings: Ring[] = [
    makeRing(198, 15, 1, 0.55, 22, 3),
    makeRing(170, 13, -1, 0.8, 14, 2),
    makeRing(142, 12, 1, 1.1, 30, 4),
    makeRing(114, 11, -1, 1.5, 9, 2),
    makeRing(88, 10, 1, 2.1, 40, 0),
  ];
  const angle = rings.map(() => Math.random() * Math.PI * 2);
  const v = {
    spin: 0.12,
    scramble: 4,
    glow: 0.7,
    sweep: 0,
    level: 0,
    tone: [...colors.accent] as RGB,
    pulse: 0,
    sweepAt: 0,
  };
  // Streams: short runs of characters flowing out along a spoke now and then.
  const streams: Array<{ a: number; d: number; text: string[] }> = [];
  let scrambleDebt = 0;

  let raf = 0;
  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000) * avatarMotion();
    last = now;
    const { state: st, reducedMotion: still, getLevel: level, center: c, radius: R } = live.current;
    const t = TARGET[st];
    const k = still ? 1 : 1 - Math.exp(-dt * 6);
    v.spin = ease(v.spin, t.spin, k);
    v.scramble = ease(v.scramble, t.scramble, k);
    v.glow = ease(v.glow, t.glow, k);
    v.sweep = ease(v.sweep, t.sweep, k);
    v.tone = mix(
      v.tone,
      t.tone === 1 ? colors.amber : t.tone === 2 ? colors.alert : colors.accent,
      k,
    );
    const lvl = st === 'speaking' || st === 'idle' ? Math.min(1, Math.max(0, level()) * 1.6) : 0;
    const md = moodNow();
    v.level = ease(v.level, lvl, still ? 1 : 1 - Math.exp(-dt * 18));
    v.pulse += dt;
    v.sweepAt += dt * 2.2;

    if (!still) {
      rings.forEach((ring, i) => {
        angle[i] = (angle[i] ?? 0) + ring.dir * ring.speed * v.spin * dt;
      });
      // Rewrite some characters: a few per second at rest, a storm while thinking.
      scrambleDebt += v.scramble * dt * 6;
      while (scrambleDebt >= 1) {
        scrambleDebt -= 1;
        const ring = rings[(Math.random() * rings.length) | 0];
        if (!ring) continue;
        const j = (Math.random() * ring.glyphs.length) | 0;
        if (ring.glyphs[j]) {
          ring.glyphs[j] = pick();
          ring.bright[j] = 1;
        }
      }
      for (const ring of rings)
        for (let j = 0; j < ring.bright.length; j++)
          ring.bright[j] = Math.max(0.25, (ring.bright[j] ?? 0) - dt * 0.9);
      if (Math.random() < dt * (0.6 + v.scramble / 20) && streams.length < 10)
        streams.push({
          a: Math.random() * Math.PI * 2,
          d: 0,
          text: Array.from({ length: 4 + ((Math.random() * 5) | 0) }, pick),
        });
      for (const s of streams) s.d += dt * (60 + v.spin * 120);
      for (let i = streams.length - 1; i >= 0; i--)
        if ((streams[i]?.d ?? 0) > 90) streams.splice(i, 1);
    }

    ctx.setTransform(px, 0, 0, px, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const s = R / 210;
    const jitter =
      (st === 'error' && !still ? (Math.random() - 0.5) * 3 : 0) +
      Math.sin(v.pulse * 14) * 5 * md.confused;
    ctx.save();
    ctx.translate(c.x + jitter, c.y);
    ctx.scale(s, s);
    const col: RGB = md.pleased
      ? mix(v.tone, [90, 235, 160], md.pleased * 0.6)
      : md.confused
        ? mix(v.tone, colors.amber, md.confused * 0.5)
        : v.tone;
    const breathe = 1 + v.level * 0.06 + Math.sin(v.pulse * 1.4) * 0.008;

    // Core: soft glow, a turning hexagon and a bright centre that swells with the voice.
    const coreR = 46 + v.level * 18;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR * 1.9);
    g.addColorStop(0, rgba(colors.ice, 0.55 * v.glow + v.level * 0.3));
    g.addColorStop(0.35, rgba(col, 0.35 * v.glow));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, coreR * 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(col, 0.75);
    ctx.lineWidth = 1.5;
    for (const [rr, rot, n] of [
      [coreR, angle[0] ?? 0, 6],
      [coreR * 0.62, -(angle[1] ?? 0) * 1.5, 3],
    ] as const) {
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = rot + (i / n) * Math.PI * 2;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = rgba(colors.ice, 0.85);
    ctx.beginPath();
    ctx.arc(0, 0, 5 + v.level * 7, 0, Math.PI * 2);
    ctx.fill();

    // Rings of code.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    rings.forEach((ring, i) => {
      const r = ring.r * breathe;
      const n = ring.glyphs.length;
      const base = angle[i] ?? 0;
      ctx.font = `600 ${ring.size + 1}px "JetBrains Mono", ui-monospace, monospace`;
      // Faint guide circle just inside each ring.
      ctx.strokeStyle = rgba(col, 0.12);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, r - ring.size * 0.75, 0, Math.PI * 2);
      ctx.stroke();
      for (let j = 0; j < n; j++) {
        const ch = ring.glyphs[j];
        if (!ch) continue;
        const a = base + (j / n) * Math.PI * 2;
        // Listening: a bright sweep runs round the rings.
        const sweepDist = Math.abs(
          ((((a - v.sweepAt * ring.dir) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI,
        );
        const sweep = v.sweep * Math.max(0, 1 - (Math.PI - sweepDist) / 0.6);
        const alpha =
          (0.42 + (ring.bright[j] ?? 0) * 0.5 + sweep * 0.6 + v.level * 0.25) *
          (0.6 + v.glow * 0.4) *
          (1 - i * 0.07);
        ctx.save();
        ctx.rotate(a);
        ctx.translate(r, 0);
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = (ring.bright[j] ?? 0) > 0.9 ? rgba(colors.ice, alpha) : rgba(col, alpha);
        ctx.fillText(ch, 0, 0);
        ctx.restore();
      }
    });

    // Tick marks around the outside.
    ctx.strokeStyle = rgba(col, 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    const outer = 214 * breathe;
    for (let i = 0; i < 72; i++) {
      const a = -(angle[0] ?? 0) * 0.3 + (i / 72) * Math.PI * 2;
      const len = i % 6 === 0 ? 8 : 3;
      ctx.moveTo(Math.cos(a) * outer, Math.sin(a) * outer);
      ctx.lineTo(Math.cos(a) * (outer + len), Math.sin(a) * (outer + len));
    }
    ctx.stroke();

    // Streams flowing outward from the core.
    ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
    for (const st2 of streams) {
      st2.text.forEach((ch, i) => {
        const d = 60 + st2.d - i * 9;
        if (d < 58 || d > 150) return;
        ctx.fillStyle = rgba(col, (1 - i / st2.text.length) * 0.7 * (1 - st2.d / 90));
        ctx.fillText(ch, Math.cos(st2.a) * d, Math.sin(st2.a) * d);
      });
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
