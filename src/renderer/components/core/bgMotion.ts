/** Moving backgrounds: a light canvas layer over the painted (still) background. Twinkling
 *  stars, the odd shooting star, and one effect per scene (the black hole's disc turning,
 *  gas falling into the wormhole, glints along the giant's rings, the sun's glare breathing,
 *  satellites crossing, drifting glow for the other backgrounds). It pauses when the app is
 *  hidden, stops for "reduce motion", and runs at 30 fps or less. Framework-free: shared by
 *  the PC and the phone. `motionPlan` is pure (tests/bgMotion.test.ts). */

export type BgMotion = 'off' | 'calm' | 'lively';
export type MotionEffect =
  'disc' | 'infall' | 'rings' | 'flare' | 'satellites' | 'galaxies' | 'glow';

export interface MotionPlan {
  effect: MotionEffect;
  /** Where the scene's centre is (fractions of width / height) and its size (of min side). */
  cx: number;
  cy: number;
  r: number;
  stars: number;
  /** Seconds between shooting stars (0 = none). */
  shootEvery: number;
  /** Overall speed multiplier. */
  speed: number;
  fps: number;
}

const EFFECTS: Record<string, Pick<MotionPlan, 'effect' | 'cx' | 'cy' | 'r'>> = {
  horizon: { effect: 'disc', cx: 0.5, cy: 0.24, r: 0.1 },
  wormhole: { effect: 'infall', cx: 0.5, cy: 0.24, r: 0.16 },
  ringed: { effect: 'rings', cx: 0.8, cy: 0.15, r: 0.2 },
  sun: { effect: 'flare', cx: 0.2, cy: 0.2, r: 0.05 },
  orbit: { effect: 'satellites', cx: 0.5, cy: 0.74, r: 0 },
  deepfield: { effect: 'galaxies', cx: 0.5, cy: 0.5, r: 0 },
};

/** What to draw for a background at a level (null = nothing at all). */
export function motionPlan(
  id: string,
  level: BgMotion,
  opts: { shooting: boolean; area: number },
): MotionPlan | null {
  if (level === 'off' || !id || id === 'none' || id === 'photo' || id === 'plain') return null;
  const base = EFFECTS[id] ?? { effect: 'glow' as const, cx: 0.5, cy: 0.4, r: 0 };
  const lively = level === 'lively';
  // About one twinkling star per 9,000 px² (capped), so phones and big screens look alike.
  const stars = Math.round(
    Math.min(lively ? 220 : 140, Math.max(30, opts.area / (lively ? 6000 : 9000))),
  );
  return {
    ...base,
    stars,
    shootEvery: opts.shooting ? (lively ? 7 : 16) : 0,
    speed: lively ? 1.8 : 1,
    fps: lively ? 30 : 24,
  };
}

type Star = { x: number; y: number; r: number; a: number; p: number; f: number; c: string };
type Bit = { t: number; d: number; s: number; a: number };

const STAR_COLOURS = ['255,255,255', '210,225,255', '255,236,210', '190,210,255', '255,220,190'];

/** Start the layer on `canvas` (sized to its box). Returns a function that stops it. */
export function startBgMotion(
  canvas: HTMLCanvasElement,
  id: string,
  o: { level: BgMotion; shooting: boolean; parallax?: boolean; accent?: () => string },
): () => void {
  const ctx = canvas.getContext('2d');
  const reduce =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!ctx || reduce) {
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    return () => undefined;
  }
  let plan: MotionPlan | null = null;
  let stars: Star[] = [];
  let bits: Bit[] = [];
  let W = 0;
  let H = 0;
  let dpr = 1;
  const rand = Math.random;
  const setup = (): void => {
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    W = Math.max(1, Math.round(canvas.clientWidth * dpr));
    H = Math.max(1, Math.round(canvas.clientHeight * dpr));
    canvas.width = W;
    canvas.height = H;
    plan = motionPlan(id, o.level, { shooting: o.shooting, area: (W * H) / (dpr * dpr) });
    stars = Array.from({ length: plan?.stars ?? 0 }, () => ({
      x: rand(),
      y: rand(),
      r: (0.4 + rand() ** 3 * 1.4) * dpr,
      a: 0.25 + rand() * 0.6,
      p: rand() * Math.PI * 2,
      f: 0.4 + rand() * 1.6,
      c: STAR_COLOURS[Math.floor(rand() * STAR_COLOURS.length)] ?? '255,255,255',
    }));
    const n =
      plan?.effect === 'disc'
        ? 90
        : plan?.effect === 'infall'
          ? 70
          : plan?.effect === 'rings'
            ? 26
            : 0;
    bits = Array.from({ length: n }, () => ({
      t: rand() * Math.PI * 2,
      d: rand(),
      s: 0.5 + rand(),
      a: rand(),
    }));
  };
  setup();
  if (!plan) return () => undefined;

  // A shooting star now and then.
  let shoot: { x: number; y: number; vx: number; vy: number; life: number } | null = null;
  let nextShoot = performance.now() + 3000 + rand() * 6000;
  // Satellites crossing (From orbit).
  let sat: { x: number; y: number; vx: number; vy: number } | null = null;
  // Parallax: follows the mouse (PC) or the phone's tilt, a few pixels at most.
  let px = 0;
  let py = 0;
  let tx = 0;
  let ty = 0;
  const onMove = (e: PointerEvent): void => {
    tx = (e.clientX / window.innerWidth - 0.5) * 2;
    ty = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  const onTilt = (e: DeviceOrientationEvent): void => {
    if (e.gamma == null || e.beta == null) return;
    tx = Math.max(-1, Math.min(1, e.gamma / 30));
    ty = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
  };
  if (o.parallax) {
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('deviceorientation', onTilt, { passive: true });
  }

  let raf = 0;
  let last = 0;
  const draw = (now: number): void => {
    raf = requestAnimationFrame(draw);
    const p = plan;
    if (!p || now - last < 1000 / p.fps) return;
    last = now;
    const t = (now / 1000) * p.speed;
    ctx.clearRect(0, 0, W, H);
    px += (tx - px) * 0.05;
    py += (ty - py) * 0.05;
    const ox = px * 8 * dpr;
    const oy = py * 8 * dpr;
    const m = Math.min(W, H);
    const cx = p.cx * W;
    const cy = p.cy * H;
    ctx.globalCompositeOperation = 'lighter';

    // Twinkling stars (they sit a little "further away" than the effects: less parallax).
    for (const s of stars) {
      const tw = 0.5 + 0.5 * Math.sin(t * s.f + s.p);
      ctx.fillStyle = `rgba(${s.c},${(s.a * (0.25 + 0.75 * tw)).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x * W + ox * 0.5, s.y * H + oy * 0.5, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (p.effect === 'disc') {
      // Bright clumps going round the hole in its thin, nearly edge-on disc; the far side is
      // hidden behind the shadow, so skip what would sit on it.
      const rx = m * 0.22;
      const ry = m * 0.035;
      const hole = m * p.r;
      for (const b of bits) {
        const rad = 1 + b.d * 0.9;
        const ang = b.t + t * (0.35 / rad ** 1.5);
        const x = cx + Math.cos(ang) * rx * rad + ox;
        const y = cy + Math.sin(ang) * ry * rad + oy;
        const behind = Math.sin(ang) < 0 && Math.abs(x - cx - ox) < hole * 1.05;
        if (behind) continue;
        const a = (0.18 + 0.4 * b.a) * (1.3 - b.d * 0.6);
        ctx.fillStyle = `rgba(255,${200 - Math.round(b.d * 70)},${140 - Math.round(b.d * 80)},${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(x, y, 1.6 * dpr * b.s, 0.9 * dpr * b.s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // The photon ring breathes, very gently.
      const g = ctx.createRadialGradient(
        cx + ox,
        cy + oy,
        hole * 1.15,
        cx + ox,
        cy + oy,
        hole * 1.9,
      );
      const k = 0.06 + 0.04 * Math.sin(t * 0.6);
      g.addColorStop(0, `rgba(255,215,165,${k.toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx + ox, cy + oy, hole * 1.9, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.effect === 'infall') {
      // Glowing gas spiralling in towards the sphere and fading at its edge.
      const R = m * p.r;
      for (const b of bits) {
        const life = (b.a + t * 0.05 * b.s) % 1;
        const rad = R * (1 + (1 - life) * 2.4);
        const ang = b.t + life * 2.2;
        const x = cx + Math.cos(ang) * rad + ox;
        const y = cy + Math.sin(ang) * rad + oy;
        const a = Math.sin(life * Math.PI) * 0.35;
        ctx.fillStyle = `rgba(170,205,255,${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, (0.7 + life * 1.3) * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (p.effect === 'rings') {
      // Glints travelling slowly round the rings.
      const R = m * p.r;
      const tilt = -0.32;
      for (const b of bits) {
        const ang = b.t + t * 0.05 * b.s;
        const rr = R * (1.35 + b.d * 0.75);
        const ex = Math.cos(ang) * rr;
        const ey = Math.sin(ang) * rr * 0.26;
        const x = cx + ex * Math.cos(tilt) - ey * Math.sin(tilt) + ox;
        const y = cy + ex * Math.sin(tilt) + ey * Math.cos(tilt) + oy;
        // Behind the planet: hidden.
        if (Math.sin(ang) < 0 && Math.hypot(x - cx - ox, y - cy - oy) < R) continue;
        const a = 0.12 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.3 + b.t * 5));
        ctx.fillStyle = `rgba(245,225,190,${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.1 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (p.effect === 'flare') {
      // The star's glare breathing, and a slow turning cross of light.
      const k = 0.5 + 0.5 * Math.sin(t * 0.8);
      const g = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, m * 0.22);
      g.addColorStop(0, `rgba(255,240,210,${(0.1 + 0.08 * k).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,160,70,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(cx + ox, cy + oy);
      ctx.rotate(t * 0.02);
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 4);
        const len = m * (0.12 + 0.05 * k);
        const lg = ctx.createLinearGradient(-len, 0, len, 0);
        lg.addColorStop(0, 'rgba(255,230,200,0)');
        lg.addColorStop(0.5, `rgba(255,235,205,${(0.08 + 0.05 * k).toFixed(3)})`);
        lg.addColorStop(1, 'rgba(255,230,200,0)');
        ctx.fillStyle = lg;
        ctx.fillRect(-len, -0.6 * dpr, len * 2, 1.2 * dpr);
      }
      ctx.restore();
    } else if (p.effect === 'satellites') {
      if (!sat && rand() < 0.004 * p.speed)
        sat = {
          x: -10,
          y: H * (0.1 + rand() * 0.4),
          vx: (0.6 + rand() * 0.6) * dpr * p.speed,
          vy: (rand() - 0.5) * 0.2 * dpr,
        };
      if (sat) {
        sat.x += sat.vx;
        sat.y += sat.vy;
        const blink = Math.sin(now / 160) > 0.7 ? 0.9 : 0.45;
        ctx.fillStyle = `rgba(230,240,255,${blink})`;
        ctx.beginPath();
        ctx.arc(sat.x + ox, sat.y + oy, 1.2 * dpr, 0, Math.PI * 2);
        ctx.fill();
        if (sat.x > W + 10) sat = null;
      }
      // The atmosphere's edge shimmering.
      const k = 0.5 + 0.5 * Math.sin(t * 0.5);
      const g = ctx.createLinearGradient(0, H * 0.66, 0, H * 0.8);
      g.addColorStop(0, 'rgba(80,160,255,0)');
      g.addColorStop(0.5, `rgba(110,190,255,${(0.025 + 0.03 * k).toFixed(3)})`);
      g.addColorStop(1, 'rgba(80,160,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, H * 0.66, W, H * 0.14);
    } else if (p.effect === 'glow' || p.effect === 'galaxies') {
      // Two soft lights drifting slowly (in the theme colour for the non-space backgrounds).
      const col = p.effect === 'galaxies' ? '140,110,255' : (o.accent?.() ?? '63,208,255');
      for (let i = 0; i < 2; i++) {
        const x = W * (0.5 + 0.35 * Math.sin(t * 0.05 + i * 2.4)) + ox * 1.5;
        const y = H * (0.45 + 0.3 * Math.cos(t * 0.04 + i * 1.7)) + oy * 1.5;
        const g = ctx.createRadialGradient(x, y, 0, x, y, m * 0.45);
        g.addColorStop(0, `rgba(${col},0.07)`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
    }

    // Shooting star.
    if (p.shootEvery && !shoot && now > nextShoot) {
      const fromLeft = rand() < 0.5;
      const sp = (9 + rand() * 6) * dpr;
      shoot = {
        x: W * (fromLeft ? 0.1 + rand() * 0.4 : 0.5 + rand() * 0.4),
        y: H * (0.05 + rand() * 0.3),
        vx: fromLeft ? sp : -sp,
        vy: sp * (0.35 + rand() * 0.25),
        life: 1,
      };
      nextShoot = now + p.shootEvery * 1000 * (0.6 + rand() * 0.8);
    }
    if (shoot) {
      const s = shoot;
      const len = 14;
      const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * len, s.y - s.vy * len);
      g.addColorStop(0, `rgba(255,255,255,${(0.8 * s.life).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.4 * dpr;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * len, s.y - s.vy * len);
      ctx.stroke();
      s.x += s.vx;
      s.y += s.vy;
      s.life -= 0.035;
      if (s.life <= 0 || s.x < -50 || s.x > W + 50 || s.y > H) shoot = null;
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  const start = (): void => {
    cancelAnimationFrame(raf);
    if (!document.hidden) raf = requestAnimationFrame(draw);
  };
  let rt: ReturnType<typeof setTimeout> | undefined;
  const onResize = (): void => {
    clearTimeout(rt);
    rt = setTimeout(setup, 250);
  };
  document.addEventListener('visibilitychange', start);
  window.addEventListener('resize', onResize);
  start();
  return () => {
    cancelAnimationFrame(raf);
    clearTimeout(rt);
    document.removeEventListener('visibilitychange', start);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('deviceorientation', onTilt);
    ctx.clearRect(0, 0, W, H);
  };
}
