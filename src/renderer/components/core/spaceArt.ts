/** Realistic space backgrounds, painted once onto a canvas (no animation, so no battery cost):
 *  stars with real colours and brightness spread, noise-based nebulae, shaded planets with
 *  bands and rings, a black hole with its lensed disc, a wormhole, a distant sun and a planet
 *  seen from orbit. Original designs. Framework-free, shared by the PC and the phone app.
 *  The result is set as the element's background image (cached per scene and size). */

export type SpaceArtId = 'horizon' | 'wormhole' | 'ringed' | 'sun' | 'orbit' | 'deepfield';
export const SPACE_ART_IDS: readonly SpaceArtId[] = [
  'horizon',
  'wormhole',
  'ringed',
  'sun',
  'orbit',
  'deepfield',
];
export const isSpaceArt = (v: unknown): v is SpaceArtId => SPACE_ART_IDS.includes(v as SpaceArtId);

type Ctx = CanvasRenderingContext2D;
type Rgb = [number, number, number];

/* ── Randomness and noise (seeded, so a scene looks the same every time) ── */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
function makeNoise(seed: number): (x: number, y: number) => number {
  const r = rng(seed);
  const N = 256;
  const g = new Float32Array(N * N);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (x: number, y: number): number => g[((y & 255) << 8) | (x & 255)] ?? 0;
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
function fbm(n: (x: number, y: number) => number, x: number, y: number, oct = 5): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * n(x * f, y * f);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}
const clamp = (v: number, a = 0, b = 1): number => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const rgba = (c: Rgb, a: number): string =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${clamp(a)})`;

/* ── Building blocks ── */
const STAR_COLOURS: Rgb[] = [
  [155, 176, 255],
  [170, 191, 255],
  [202, 215, 255],
  [248, 247, 255],
  [255, 244, 234],
  [255, 230, 200],
  [255, 210, 161],
  [255, 190, 130],
];

/** Stars: many faint, few bright, real colours; `band` makes a soft Milky Way stripe. */
function stars(c: Ctx, w: number, h: number, seed: number, density = 1, band = 0): void {
  const r = rng(seed);
  const n = makeNoise(seed + 7);
  const count = Math.round(((w * h) / 340) * density);
  const scale = Math.max(w, h) / 1400;
  for (let i = 0; i < count; i++) {
    const x = r() * w;
    const y = r() * h;
    if (band > 0) {
      // Denser along a diagonal band, with dusty gaps.
      const d = Math.abs((x / w - 0.15) * 0.55 - (y / h - 0.1) * 0.9);
      const keep = 0.25 + band * Math.exp(-d * d * 18) * (0.4 + 0.8 * fbm(n, x / 90, y / 90, 3));
      if (r() > keep) continue;
    }
    // Mostly pinpricks; only a few in a hundred are bright enough to glow.
    const b = Math.pow(r(), 9);
    const col = STAR_COLOURS[Math.floor(r() * STAR_COLOURS.length)] ?? [255, 255, 255];
    const size = (0.28 + b * 1.25) * scale;
    const a = 0.18 + b * 0.82;
    if (b > 0.78) {
      const g = c.createRadialGradient(x, y, 0, x, y, size * 4);
      g.addColorStop(0, rgba(col, 0.32));
      g.addColorStop(1, rgba(col, 0));
      c.fillStyle = g;
      c.fillRect(x - size * 4, y - size * 4, size * 8, size * 8);
    }
    c.fillStyle = rgba(col, a);
    c.beginPath();
    c.arc(x, y, size, 0, Math.PI * 2);
    c.fill();
  }
}

/** Gas clouds: layered noise, drawn small and smoothed up (fast), added as light. */
function nebula(
  c: Ctx,
  w: number,
  h: number,
  seed: number,
  colours: [Rgb, Rgb],
  strength: number,
  mask?: (u: number, v: number) => number,
): void {
  const k = 4;
  const sw = Math.max(8, Math.round(w / k));
  const sh = Math.max(8, Math.round(h / k));
  const off = document.createElement('canvas');
  off.width = sw;
  off.height = sh;
  const o = off.getContext('2d');
  if (!o) return;
  const img = o.createImageData(sw, sh);
  const n1 = makeNoise(seed);
  const n2 = makeNoise(seed + 31);
  const sc = 3.2 / Math.max(sw, sh);
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++) {
      const wx = x * sc + 0.6 * fbm(n2, x * sc * 1.7, y * sc * 1.7, 3);
      const wy = y * sc + 0.6 * fbm(n2, x * sc * 1.7 + 9, y * sc * 1.7 + 4, 3);
      const d = smooth(0.42, 0.85, fbm(n1, wx * 2, wy * 2, 6));
      const m = mask ? mask(x / sw, y / sh) : 1;
      const t = fbm(n2, x * sc * 3, y * sc * 3, 2);
      const col = mix(colours[0], colours[1], t);
      const a = d * m * strength;
      const i = (y * sw + x) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = clamp(a) * 255;
    }
  o.putImageData(img, 0, 0);
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(off, 0, 0, w, h);
  c.restore();
}

function glow(c: Ctx, x: number, y: number, r: number, col: Rgb, a: number): void {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a));
  g.addColorStop(0.35, rgba(col, a * 0.35));
  g.addColorStop(1, rgba(col, 0));
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
  c.restore();
}

/** A lit sphere painted pixel by pixel: `surface` gives the colour at latitude/longitude. */
function sphere(
  c: Ctx,
  cx: number,
  cy: number,
  R: number,
  light: [number, number, number],
  surface: (lat: number, lon: number, nx: number, ny: number) => Rgb,
  atmosphere?: Rgb,
): void {
  const x0 = Math.max(0, Math.floor(cx - R - 2));
  const y0 = Math.max(0, Math.floor(cy - R - 2));
  const x1 = Math.min(c.canvas.width, Math.ceil(cx + R + 2));
  const y1 = Math.min(c.canvas.height, Math.ceil(cy + R + 2));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return;
  const img = c.getImageData(x0, y0, w, h);
  const [lx, ly, lz] = light;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const nx = (x0 + x + 0.5 - cx) / R;
      const ny = (y0 + y + 0.5 - cy) / R;
      const rr = nx * nx + ny * ny;
      if (rr > 1) continue;
      const nz = Math.sqrt(1 - rr);
      const lit = Math.max(0, nx * lx + ny * ly + nz * lz);
      const lat = Math.asin(clamp(-ny, -1, 1));
      const lon = Math.atan2(nx, nz);
      const base = surface(lat, lon, nx, ny);
      // Soft terminator, darker towards the edge (limb darkening), a little ambient light.
      const shade = Math.pow(lit, 0.85) * (0.55 + 0.45 * nz) + 0.015;
      let col: Rgb = [base[0] * shade, base[1] * shade, base[2] * shade];
      if (atmosphere) {
        const rim = Math.pow(1 - nz, 3) * Math.min(1, lit * 2.5 + 0.05);
        col = mix(col, atmosphere, clamp(rim * 0.9));
      }
      const edge = clamp((1 - Math.sqrt(rr)) * R * 1.5);
      const i = (y * w + x) * 4;
      img.data[i] = (img.data[i] ?? 0) * (1 - edge) + col[0] * edge;
      img.data[i + 1] = (img.data[i + 1] ?? 0) * (1 - edge) + col[1] * edge;
      img.data[i + 2] = (img.data[i + 2] ?? 0) * (1 - edge) + col[2] * edge;
      img.data[i + 3] = 255;
    }
  c.putImageData(img, x0, y0);
}

/** Rings around a planet, tilted; `half` draws the back (behind the planet) or front. */
function rings(
  c: Ctx,
  cx: number,
  cy: number,
  R: number,
  tilt: number,
  squash: number,
  half: 'back' | 'front',
  seed: number,
  lightSide: number,
): void {
  const n = makeNoise(seed);
  c.save();
  c.translate(cx, cy);
  c.rotate(tilt);
  c.scale(1, squash);
  c.beginPath();
  if (half === 'back') c.rect(-R * 3, -R * 3, R * 6, R * 3);
  else c.rect(-R * 3, 0, R * 6, R * 3);
  c.clip();
  const inner = R * 1.25;
  const outer = R * 2.25;
  const steps = 140;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const rad = inner + (outer - inner) * t;
    let a = 0.15 + 0.6 * fbm(n, t * 40, 0.5, 3);
    if (t > 0.58 && t < 0.62) a *= 0.08; // the big gap
    if (t > 0.9) a *= (1 - t) * 10;
    const col = mix([150, 120, 90], [235, 215, 180], fbm(n, t * 12, 3.3, 2));
    const g = c.createLinearGradient(-rad, 0, rad, 0);
    g.addColorStop(0, rgba(col, a * (lightSide < 0 ? 1 : 0.35)));
    g.addColorStop(1, rgba(col, a * (lightSide < 0 ? 0.35 : 1)));
    c.strokeStyle = g;
    c.lineWidth = ((outer - inner) / steps) * 1.4;
    c.beginPath();
    c.arc(0, 0, rad, 0, Math.PI * 2);
    c.stroke();
  }
  c.restore();
}

/* ── Scenes ── */
function bg(c: Ctx, w: number, h: number, top: string, bottom: string): void {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

/* ── The black hole: ray traced through curved space (Schwarzschild, non-spinning) ──
 * Units: the Schwarzschild radius Rs = 2GM/c² = 1, c = 1.
 * Light paths: in these coordinates a light ray's path obeys exactly
 *     d²x/dλ² = −(3/2) · h² · x / r⁵,   h = |x × dx/dλ|  (its angular momentum, constant),
 * so each pixel's ray is stepped backwards from the camera until it falls through the
 * horizon (r < 1: black), hits the accretion disc, or escapes to the stars.
 * Disc: thin, in the equatorial plane, from the innermost stable circular orbit (r = 3) out
 * to r = 14. Temperature from the standard thin-disc law T ∝ r^(−3/4)·(1 − √(3/r))^(1/4).
 * Seen light is shifted by g = (gravitational redshift √(1 − 1/r)) × (Doppler factor of gas on
 * a circular orbit, speed β = √(1 / (2(r − 1))) as seen by a static observer): colour from the
 * shifted blackbody temperature g·T, brightness ∝ g⁴ (bolometric), so the side coming
 * towards us is brighter and bluer. Escaping rays that were bent pick up lensed stars. */

const R_IN = 3;
const R_OUT = 14;

/** Blackbody colour for a temperature in kelvin (a standard fit), 0–1 per channel. */
function blackbody(T: number): Rgb {
  const t = clamp(T, 1000, 40000) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g =
    t <= 66
      ? 99.4708025861 * Math.log(t) - 161.1195681661
      : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [clamp(r, 0, 255) / 255, clamp(g, 0, 255) / 255, clamp(b, 0, 255) / 255];
}

/** Thin-disc temperature profile, 1 at its hottest. */
const discShape = (r: number): number =>
  Math.pow(r, -0.75) * Math.pow(Math.max(0, 1 - Math.sqrt(R_IN / r)), 0.25);
const SHAPE_MAX = (() => {
  let m = 0;
  for (let r = R_IN; r < R_OUT; r += 0.01) m = Math.max(m, discShape(r));
  return m;
})();

function hash3(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A star in the direction (dx,dy,dz), if there is one: [brightness 0–1, colour]. */
function starAt(dx: number, dy: number, dz: number): [number, Rgb] {
  const S = 420;
  const qx = Math.floor(dx * S);
  const qy = Math.floor(dy * S);
  const qz = Math.floor(dz * S);
  const hv = hash3(qx, qy, qz);
  if (hv > 0.03) return [0, [0, 0, 0]];
  const fx = dx * S - qx - 0.5;
  const fy = dy * S - qy - 0.5;
  const fz = dz * S - qz - 0.5;
  const d = Math.sqrt(fx * fx + fy * fy + fz * fz);
  const b = Math.pow(hash3(qz, qx, qy), 5) * 0.9 + 0.1;
  const col = STAR_COLOURS[Math.floor(hash3(qy, qz, qx) * STAR_COLOURS.length)] ?? [255, 255, 255];
  return [clamp(1 - d / 0.35) * b, [col[0] / 255, col[1] / 255, col[2] / 255]];
}

function paintHorizon(c: Ctx, w: number, h: number): void {
  bg(c, w, h, '#030204', '#010102');
  stars(c, w, h, 11, 0.9, 0.6);
  nebula(
    c,
    w,
    h,
    5,
    [
      [90, 40, 20],
      [50, 25, 80],
    ],
    0.28,
  );
  const m = Math.min(w, h);
  const cx = w * 0.5;
  const cy = h * 0.24;
  // Camera 30 Rs away, 8° above the disc (nearly edge-on).
  const D = 30;
  const el = (8 * Math.PI) / 180;
  const shadowPx = m * 0.1;
  // The shadow's edge is at impact parameter b = (3√3/2)·Rs: size the view from that.
  const fpx = shadowPx / ((1.5 * Math.sqrt(3)) / D);
  const halfW = Math.min(w / 2, fpx * 0.5);
  const halfH = Math.min(h / 2, shadowPx * 5.5);
  const area = 4 * halfW * halfH;
  const k = Math.max(1, Math.ceil(Math.sqrt(area / 70000)));
  const rw = Math.ceil((2 * halfW) / k);
  const rh = Math.ceil((2 * halfH) / k);
  const x0 = cx - halfW;
  const y0 = cy - halfH;
  const off = document.createElement('canvas');
  off.width = rw;
  off.height = rh;
  const o = off.getContext('2d');
  if (!o) return;
  const img = o.createImageData(rw, rh);
  const tex = makeNoise(17);
  // Camera frame.
  const C: [number, number, number] = [0, D * Math.sin(el), -D * Math.cos(el)];
  const F: [number, number, number] = [0, -Math.sin(el), Math.cos(el)];
  const RT: [number, number, number] = [1, 0, 0];
  const UP: [number, number, number] = [0, Math.cos(el), Math.sin(el)];
  // Display exposure. (A real disc is millions of kelvin; its colour is shown as if it were a
  // few thousand, the warm glow eyes and cameras can show, keeping the physics of the shifts.)
  const exposure = 0.55;
  for (let j = 0; j < rh; j++)
    for (let i = 0; i < rw; i++) {
      const sx = (x0 + (i + 0.5) * k - cx) / fpx;
      const sy = (y0 + (j + 0.5) * k - cy) / fpx;
      let vx = F[0] + sx * RT[0] - sy * UP[0];
      let vy = F[1] + sx * RT[1] - sy * UP[1];
      let vz = F[2] + sx * RT[2] - sy * UP[2];
      const vl = Math.hypot(vx, vy, vz);
      vx /= vl;
      vy /= vl;
      vz /= vl;
      const d0x = vx;
      const d0y = vy;
      const d0z = vz;
      let x = C[0];
      let y = C[1];
      let z = C[2];
      const hx = y * vz - z * vy;
      const hy = z * vx - x * vz;
      const hz = x * vy - y * vx;
      const h2 = hx * hx + hy * hy + hz * hz;
      let r = Math.hypot(x, y, z);
      let ax = (-1.5 * h2 * x) / Math.pow(r, 5);
      let ay = (-1.5 * h2 * y) / Math.pow(r, 5);
      let az = (-1.5 * h2 * z) / Math.pow(r, 5);
      let out: [number, number, number, number] = [0, 0, 0, 0];
      let done = false;
      for (let s = 0; s < 900 && !done; s++) {
        const dt = clamp(0.045 * r, 0.008, 1.2);
        const px = x;
        const py = y;
        const pz = z;
        x += vx * dt + 0.5 * ax * dt * dt;
        y += vy * dt + 0.5 * ay * dt * dt;
        z += vz * dt + 0.5 * az * dt * dt;
        r = Math.hypot(x, y, z);
        const r5 = Math.pow(r, 5);
        const nax = (-1.5 * h2 * x) / r5;
        const nay = (-1.5 * h2 * y) / r5;
        const naz = (-1.5 * h2 * z) / r5;
        vx += 0.5 * (ax + nax) * dt;
        vy += 0.5 * (ay + nay) * dt;
        vz += 0.5 * (az + naz) * dt;
        ax = nax;
        ay = nay;
        az = naz;
        if (r < 1) {
          // Through the event horizon: nothing comes back.
          out = [0, 0, 0, 1];
          done = true;
          break;
        }
        if (py > 0 !== y > 0) {
          // Crossed the disc's plane: where exactly?
          const t = py / (py - y);
          const hxp = px + (x - px) * t;
          const hzp = pz + (z - pz) * t;
          const rp = Math.hypot(hxp, hzp);
          if (rp >= R_IN && rp <= R_OUT) {
            // Gas on a circular orbit (anticlockwise seen from above), its speed for a static
            // observer, and the direction the light leaves it towards the camera (−v).
            const beta = Math.min(0.99, Math.sqrt(1 / (2 * (rp - 1))));
            const gamma = 1 / Math.sqrt(1 - beta * beta);
            const ux = -hzp / rp;
            const uz = hxp / rp;
            const vn = Math.hypot(vx, vy, vz);
            const nx = -vx / vn;
            const nz = -vz / vn;
            const doppler = 1 / (gamma * (1 - beta * (ux * nx + uz * nz)));
            const g = doppler * Math.sqrt(1 - 1 / rp);
            const shape = discShape(rp) / SHAPE_MAX;
            const T = 4600 * shape * g;
            const phi = Math.atan2(hzp, hxp);
            // Turbulent, slightly spiralling streaks in the gas.
            const streak = 0.55 + 0.9 * fbm(tex, Math.log(rp) * 9, phi * 2.2 + Math.log(rp) * 3, 4);
            const I = Math.pow(shape * g, 4) * streak;
            const col = blackbody(T);
            const v = 1 - Math.exp(-I * exposure * 3);
            // The outer edge fades out rather than stopping sharply.
            const edge = smooth(R_OUT, R_OUT - 4, rp);
            out = [col[0] * v * 255, col[1] * v * 255, col[2] * v * 255, clamp(v * 1.6) * edge];
            if (out[3] > 0.02) {
              done = true;
              break;
            }
          }
        }
        if (r > D * 1.4 && x * vx + y * vy + z * vz > 0) break;
      }
      if (!done) {
        // Escaped: how far was it bent? Unbent light shows the normal sky (left transparent);
        // bent light gets the lensed stars and hides the unbent ones behind it.
        const vn = Math.hypot(vx, vy, vz);
        const dx = vx / vn;
        const dy = vy / vn;
        const dz = vz / vn;
        const bend = Math.acos(clamp(dx * d0x + dy * d0y + dz * d0z, -1, 1));
        const block = smooth(0.01, 0.06, bend);
        const [sb, sc] = starAt(dx, dy, dz);
        const sa = sb * block;
        const a = Math.max(block, sa);
        out = [
          sc[0] * 255 * (sa / Math.max(a, 1e-3)),
          sc[1] * 255 * (sa / Math.max(a, 1e-3)),
          sc[2] * 255 * (sa / Math.max(a, 1e-3)),
          a,
        ];
      }
      const p = (j * rw + i) * 4;
      img.data[p] = out[0];
      img.data[p + 1] = out[1];
      img.data[p + 2] = out[2];
      // Fade into the normal sky towards the edges of the traced area.
      const fade = Math.min(i, rw - 1 - i, j, rh - 1 - j) / (Math.min(rw, rh) * 0.12);
      img.data[p + 3] = clamp(out[3]) * clamp(fade) * 255;
    }
  o.putImageData(img, 0, 0);
  c.save();
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(off, x0, y0, rw * k, rh * k);
  // A soft glow from the brightest gas (how a camera or eye sees it).
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = 0.55;
  c.filter = `blur(${Math.max(2, shadowPx * 0.12)}px)`;
  c.drawImage(off, x0, y0, rw * k, rh * k);
  c.restore();
}

function paintWormhole(c: Ctx, w: number, h: number): void {
  bg(c, w, h, '#02030a', '#010208');
  nebula(
    c,
    w,
    h,
    21,
    [
      [40, 70, 160],
      [90, 40, 140],
    ],
    0.45,
  );
  stars(c, w, h, 23, 1, 0.3);
  const m = Math.min(w, h);
  const cx = w * 0.5;
  const cy = h * 0.24;
  const R = m * 0.16;
  // Through the sphere: somewhere else entirely (warmer stars and gas), seen as if in a lens.
  const other = document.createElement('canvas');
  other.width = Math.ceil(R * 2);
  other.height = Math.ceil(R * 2);
  const o = other.getContext('2d');
  if (o) {
    bg(o, other.width, other.height, '#0b0610', '#04020a');
    nebula(
      o,
      other.width,
      other.height,
      41,
      [
        [200, 110, 60],
        [90, 60, 170],
      ],
      0.9,
    );
    stars(o, other.width, other.height, 43, 2.4);
    c.save();
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.clip();
    c.drawImage(other, cx - R, cy - R, R * 2, R * 2);
    const v = c.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,10,0.85)');
    c.fillStyle = v;
    c.fillRect(cx - R, cy - R, R * 2, R * 2);
    c.restore();
  }
  // The bright ring where light skims the edge, and a soft halo.
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 30; i++) {
    const t = i / 30;
    c.strokeStyle = rgba(mix([235, 245, 255], [90, 140, 255], t), (1 - t) * 0.18);
    c.lineWidth = (R * 0.35) / 30 + 0.8;
    c.beginPath();
    c.arc(cx, cy, R * (1 + t * 0.35), 0, Math.PI * 2);
    c.stroke();
  }
  c.restore();
  glow(c, cx, cy, R * 3.2, [90, 130, 255], 0.12);
}

function paintRinged(c: Ctx, w: number, h: number): void {
  bg(c, w, h, '#030207', '#020105');
  stars(c, w, h, 31, 1, 0.5);
  nebula(
    c,
    w,
    h,
    33,
    [
      [60, 40, 90],
      [110, 60, 40],
    ],
    0.22,
  );
  const m = Math.min(w, h);
  const cx = w * 0.8;
  const cy = h * 0.15;
  const R = m * 0.2;
  const tilt = -0.32;
  const squash = 0.26;
  rings(c, cx, cy, R, tilt, squash, 'back', 5, -1);
  const n = makeNoise(77);
  const L: [number, number, number] = [-0.75, -0.35, 0.56];
  sphere(c, cx, cy, R, L, (lat, lon) => {
    const band = fbm(n, lat * 6 + 0.35 * fbm(n, lon * 2, lat * 8, 3), 0.5, 4);
    const storm = smooth(0.7, 0.8, fbm(n, lon * 3 + 20, lat * 9, 3)) * 0.25;
    return mix(mix([150, 105, 70], [240, 215, 175], band), [255, 240, 220], storm);
  });
  rings(c, cx, cy, R, tilt, squash, 'front', 5, -1);
}

function paintSun(c: Ctx, w: number, h: number): void {
  bg(c, w, h, '#05030a', '#020206');
  stars(c, w, h, 51, 1.1, 0.9);
  nebula(
    c,
    w,
    h,
    53,
    [
      [70, 50, 120],
      [40, 70, 130],
    ],
    0.25,
    (u, v) => Math.exp(-Math.pow((u - 0.15) * 0.55 - (v - 0.1) * 0.9, 2) * 14),
  );
  const m = Math.min(w, h);
  const sx = w * 0.2;
  const sy = h * 0.2;
  glow(c, sx, sy, m * 0.55, [255, 170, 90], 0.18);
  glow(c, sx, sy, m * 0.16, [255, 220, 170], 0.55);
  glow(c, sx, sy, m * 0.035, [255, 255, 245], 1);
  // Faint spikes from the camera, and a horizontal glare streak.
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const [len, ang, a] of [
    [m * 0.9, 0, 0.35],
    [m * 0.25, Math.PI / 2, 0.25],
    [m * 0.2, Math.PI / 4, 0.12],
    [m * 0.2, -Math.PI / 4, 0.12],
  ] as const) {
    c.save();
    c.translate(sx, sy);
    c.rotate(ang);
    const g = c.createLinearGradient(-len, 0, len, 0);
    g.addColorStop(0, 'rgba(255,230,200,0)');
    g.addColorStop(0.5, `rgba(255,240,220,${a})`);
    g.addColorStop(1, 'rgba(255,230,200,0)');
    c.fillStyle = g;
    c.fillRect(-len, -0.8, len * 2, 1.6);
    c.restore();
  }
  c.restore();
  // A small rocky world, lit from the star: mostly dark, a thin bright crescent and haze.
  const px = w * 0.74;
  const py = h * 0.66;
  const R = m * 0.1;
  const dx = sx - px;
  const dy = sy - py;
  const d = Math.hypot(dx, dy);
  const L: [number, number, number] = [(dx / d) * 0.8, (dy / d) * 0.8, -0.6];
  const n = makeNoise(91);
  sphere(
    c,
    px,
    py,
    R,
    L,
    (lat, lon) => mix([90, 70, 60], [170, 150, 130], fbm(n, lon * 3, lat * 3, 5)),
    [150, 190, 255],
  );
}

function paintOrbit(c: Ctx, w: number, h: number): void {
  bg(c, w, h, '#01030a', '#010208');
  stars(c, w, h, 61, 1, 0.4);
  const R = Math.max(w, h) * 1.6;
  const cx = w * 0.5;
  const cy = h * 0.74 + R;
  const surf = makeNoise(63);
  const cloud = makeNoise(64);
  // The sun is just past the right edge: light from the side and slightly above the horizon.
  const L: [number, number, number] = [0.9, -0.1, 0.42];
  const k = 2;
  const sw = Math.ceil(w / k);
  const sh = Math.ceil(h / k);
  const off = document.createElement('canvas');
  off.width = sw;
  off.height = sh;
  const o = off.getContext('2d');
  if (!o) return;
  const img = o.createImageData(sw, sh);
  const top = Math.max(0, Math.floor((cy - R - R * 0.03) / k));
  for (let y = top; y < sh; y++)
    for (let x = 0; x < sw; x++) {
      const px = x * k;
      const py = y * k;
      const dx = (px - cx) / R;
      const dy = (py - cy) / R;
      const rr = Math.sqrt(dx * dx + dy * dy);
      const i = (y * sw + x) * 4;
      if (rr > 1) {
        // Atmosphere: a thin blue glow above the limb, brightest on the sunlit side.
        const above = (rr - 1) * R;
        const H = R * 0.006;
        const lit = clamp(0.25 + 0.75 * (dx * L[0] + 0.5));
        const a = Math.exp(-above / H) * lit;
        if (a < 0.01) continue;
        const col = mix([60, 120, 255], [190, 225, 255], Math.exp(-above / (H * 0.4)));
        img.data[i] = col[0];
        img.data[i + 1] = col[1];
        img.data[i + 2] = col[2];
        img.data[i + 3] = clamp(a) * 255;
        continue;
      }
      const nz = Math.sqrt(Math.max(0, 1 - rr * rr));
      const lit = Math.max(0, dx * L[0] + dy * L[1] + nz * L[2]);
      const u = px / 260;
      const v = py / 60; // flattened: we look across the surface
      const land = smooth(0.52, 0.6, fbm(surf, u, v, 6));
      const ground =
        land > 0
          ? mix([28, 60, 110], mix([70, 85, 50], [120, 110, 80], fbm(surf, u * 3, v * 3, 3)), land)
          : ([28, 60, 110] as Rgb);
      const cl = smooth(0.5, 0.75, fbm(cloud, u * 1.3 + 5, v * 1.3, 6));
      let col = mix(ground, [235, 240, 248], cl);
      const shade = Math.pow(lit, 0.8) + 0.02;
      col = [col[0] * shade, col[1] * shade, col[2] * shade];
      // Haze thickens towards the horizon.
      col = mix(col, [110, 160, 255], clamp(Math.pow(1 - nz, 6) * 4 * (0.3 + lit)));
      // City lights on the night side.
      if (lit < 0.05 && land > 0.5 && fbm(surf, u * 8, v * 8, 2) > 0.62)
        col = mix(col, [255, 190, 110], 0.55);
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = 255;
    }
  o.putImageData(img, 0, 0);
  c.imageSmoothingEnabled = true;
  c.drawImage(off, 0, 0, w, h);
  // Sunrise glare along the right of the horizon.
  glow(c, w * 1.02, cy - R, Math.min(w, h) * 0.6, [255, 210, 160], 0.35);
}

function paintDeepfield(c: Ctx, w: number, h: number): void {
  bg(c, w, h, '#03020a', '#020108');
  nebula(
    c,
    w,
    h,
    71,
    [
      [40, 30, 80],
      [30, 40, 90],
    ],
    0.25,
  );
  stars(c, w, h, 73, 0.35);
  const r = rng(79);
  const count = Math.round((w * h) / 3400);
  const scale = Math.max(w, h) / 1400;
  for (let i = 0; i < count; i++) {
    const x = r() * w;
    const y = r() * h;
    const size = Math.pow(r(), 4) * 26 * scale + 1.2 * scale;
    const flat = 0.25 + r() * 0.75;
    const elliptical = r() < 0.55;
    const col: Rgb = elliptical ? [255, 215, 170] : r() < 0.5 ? [175, 200, 255] : [230, 220, 255];
    c.save();
    c.translate(x, y);
    c.rotate(r() * Math.PI);
    c.scale(1, flat);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, size);
    g.addColorStop(0, rgba([255, 245, 230], 0.65));
    g.addColorStop(0.15, rgba(col, 0.38));
    g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, size, 0, Math.PI * 2);
    c.fill();
    // Bigger spirals get a hint of arms.
    if (!elliptical && size > 10 * scale) {
      c.globalCompositeOperation = 'lighter';
      for (let arm = 0; arm < 2; arm++)
        for (let s = 0; s < 40; s++) {
          const t = s / 40;
          const ang = arm * Math.PI + t * 4.2;
          const rad = size * (0.15 + t * 0.8);
          c.fillStyle = rgba([190, 210, 255], 0.18 * (1 - t));
          c.beginPath();
          c.arc(Math.cos(ang) * rad, Math.sin(ang) * rad, size * 0.07, 0, Math.PI * 2);
          c.fill();
        }
    }
    c.restore();
  }
}

const PAINT: Record<SpaceArtId, (c: Ctx, w: number, h: number) => void> = {
  horizon: paintHorizon,
  wormhole: paintWormhole,
  ringed: paintRinged,
  sun: paintSun,
  orbit: paintOrbit,
  deepfield: paintDeepfield,
};

/* ── Putting it on an element ── */
const cache = new Map<string, Promise<string>>();

function render(id: SpaceArtId, w: number, h: number): Promise<string> {
  const key = `${id}:${w}x${h}`;
  let p = cache.get(key);
  if (!p) {
    p = new Promise<string>((resolve, reject) => {
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const c = cv.getContext('2d');
      if (!c) return reject(new Error('no canvas'));
      PAINT[id](c, w, h);
      cv.toBlob(
        (b) => (b ? resolve(URL.createObjectURL(b)) : reject(new Error('no image'))),
        'image/jpeg',
        0.9,
      );
    });
    cache.set(key, p);
    // Keep the cache small (old sizes after rotating or resizing).
    if (cache.size > 24) {
      const first = cache.keys().next().value;
      if (first) cache.delete(first);
    }
  }
  return p;
}

/** Paint a space scene as `el`'s background (or clear it for any other id). The painting is
 *  sized to the element (capped, so big screens stay quick) and done after a frame so it
 *  never blocks the tap that chose it. */
export function paintSpace(el: HTMLElement, id: string, maxSide = 1600): void {
  const token = `${id}:${Date.now()}`;
  el.dataset.spaceArt = token;
  if (!isSpaceArt(id)) {
    if (el.style.backgroundImage.startsWith('url(')) el.style.background = '';
    return;
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const bw = Math.max(1, el.clientWidth || window.innerWidth) * dpr;
  const bh = Math.max(1, el.clientHeight || window.innerHeight) * dpr;
  const k = Math.min(1, maxSide / Math.max(bw, bh));
  // Round sizes so small changes (a keyboard, a scrollbar) reuse the same painting.
  const w = Math.max(16, Math.round((bw * k) / 32) * 32);
  const h = Math.max(16, Math.round((bh * k) / 32) * 32);
  setTimeout(() => {
    void render(id, w, h)
      .then((url) => {
        if (el.dataset.spaceArt !== token) return;
        el.style.background = `#000 url("${url}") center / cover no-repeat`;
      })
      .catch(() => undefined);
  }, 30);
}
