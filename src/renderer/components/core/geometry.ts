/** Polar helpers. Angles in degrees, 0° = right (east), increasing clockwise (screen space). */
export function polar(r: number, deg: number, cx = 0, cy = 0): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** SVG arc path along radius r from a0 to a1 (clockwise). */
export function arcPath(r: number, a0: number, a1: number): string {
  const s = polar(r, a0);
  const e = polar(r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}
