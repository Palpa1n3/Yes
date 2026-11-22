/** Small taskbar icons drawn in code (no image files): the overlay badge dots and the
 *  thumbnail toolbar buttons. Each shape is a coverage function on a 0–1 square, sampled 4×4
 *  per pixel for smooth edges. */
import { nativeImage, type NativeImage } from 'electron';

export type Shape = (x: number, y: number) => boolean;

const inTri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): Shape => {
  const s = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): number =>
    (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  return (x, y) => {
    const d1 = s(x, y, ax, ay, bx, by);
    const d2 = s(x, y, bx, by, cx, cy);
    const d3 = s(x, y, cx, cy, ax, ay);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
};
const rect =
  (x0: number, y0: number, x1: number, y1: number): Shape =>
  (x, y) =>
    x >= x0 && x <= x1 && y >= y0 && y <= y1;
const circle =
  (cx: number, cy: number, r: number): Shape =>
  (x, y) =>
    (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const any =
  (...s: Shape[]): Shape =>
  (x, y) =>
    s.some((f) => f(x, y));

export const SHAPES = {
  dot: circle(0.5, 0.5, 0.42),
  play: inTri(0.28, 0.18, 0.28, 0.82, 0.82, 0.5),
  pause: any(rect(0.24, 0.18, 0.42, 0.82), rect(0.58, 0.18, 0.76, 0.82)),
  next: any(inTri(0.18, 0.2, 0.18, 0.8, 0.62, 0.5), rect(0.66, 0.2, 0.8, 0.8)),
  previous: any(inTri(0.82, 0.2, 0.82, 0.8, 0.38, 0.5), rect(0.2, 0.2, 0.34, 0.8)),
  mic: any(
    (x, y) => {
      // A rounded capsule, the stand and the base.
      const cx = 0.5;
      if (y >= 0.24 && y <= 0.5) return Math.abs(x - cx) <= 0.14;
      return circle(cx, 0.24, 0.14)(x, y) || circle(cx, 0.5, 0.14)(x, y);
    },
    (x, y) => {
      const d = Math.hypot(x - 0.5, y - 0.5);
      return y >= 0.5 && d >= 0.21 && d <= 0.27;
    },
    rect(0.46, 0.72, 0.54, 0.84),
    rect(0.34, 0.82, 0.66, 0.88),
  ),
  plus: any(rect(0.44, 0.18, 0.56, 0.82), rect(0.18, 0.44, 0.82, 0.56)),
} satisfies Record<string, Shape>;

/** Coverage of a shape over a size×size image (4×4 samples per pixel), for tests and drawing. */
export function rasterise(shape: Shape, size: number): Float32Array {
  const out = new Float32Array(size * size);
  const n = 4;
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      let hit = 0;
      for (let sy = 0; sy < n; sy++)
        for (let sx = 0; sx < n; sx++)
          if (shape((px + (sx + 0.5) / n) / size, (py + (sy + 0.5) / n) / size)) hit++;
      out[py * size + px] = hit / (n * n);
    }
  return out;
}

/** An icon in one colour (r, g, b), with an optional white ring for the badge dots. */
export function makeIcon(
  shape: Shape,
  rgb: [number, number, number],
  size = 16,
  ring = false,
): NativeImage {
  const cover = rasterise(shape, size);
  const inner = ring ? rasterise(circle(0.5, 0.5, 0.3), size) : null;
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const a = cover[i] ?? 0;
    const k = inner ? (inner[i] ?? 0) : 1;
    // Ring: white edge around the coloured middle.
    const r = Math.round(rgb[0] * k + 255 * (1 - k));
    const g = Math.round(rgb[1] * k + 255 * (1 - k));
    const b = Math.round(rgb[2] * k + 255 * (1 - k));
    // BGRA, premultiplied.
    buf[i * 4] = Math.round(b * a);
    buf[i * 4 + 1] = Math.round(g * a);
    buf[i * 4 + 2] = Math.round(r * a);
    buf[i * 4 + 3] = Math.round(255 * a);
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

export const BADGE_COLOURS = {
  listening: [61, 255, 138],
  thinking: [63, 168, 255],
  approval: [255, 181, 71],
  warning: [255, 77, 94],
} as const;
