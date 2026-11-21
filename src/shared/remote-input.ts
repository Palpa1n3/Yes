/** Remote control from the phone: what it can send, checked, and mapped onto the PC's screen. */

export type RemoteInput =
  | { type: 'click' | 'right' | 'double' | 'move'; x: number; y: number }
  | { type: 'scroll'; x: number; y: number; dy: number }
  | { type: 'drag'; x: number; y: number; x2: number; y2: number }
  | { type: 'key'; keys: string }
  | { type: 'type'; text: string };

const frac = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null;

/** Turns what the phone sent into a safe input, or null. Positions are 0–1 of the screen. */
export function sanitizeInput(b: Record<string, unknown>): RemoteInput | null {
  const t = b['type'];
  const x = frac(b['x']);
  const y = frac(b['y']);
  if (t === 'click' || t === 'right' || t === 'double' || t === 'move')
    return x === null || y === null ? null : { type: t, x, y };
  if (t === 'scroll') {
    const dy = Math.round(Number(b['dy']));
    return x === null || y === null || !Number.isFinite(dy) || dy === 0
      ? null
      : { type: 'scroll', x, y, dy: Math.max(-15, Math.min(15, dy)) };
  }
  if (t === 'drag') {
    const x2 = frac(b['x2']);
    const y2 = frac(b['y2']);
    return x === null || y === null || x2 === null || y2 === null
      ? null
      : { type: 'drag', x, y, x2, y2 };
  }
  if (t === 'key') {
    const keys = String(b['keys'] ?? '').slice(0, 40);
    return /^[a-z0-9+_ ]+$/i.test(keys) && keys ? { type: 'key', keys } : null;
  }
  if (t === 'type') {
    const text = String(b['text'] ?? '').slice(0, 500);
    return text ? { type: 'type', text } : null;
  }
  return null;
}

/** A point on the PC's screen in physical pixels (what the input helper uses). */
export function toPhysical(
  fx: number,
  fy: number,
  d: { bounds: { x: number; y: number; width: number; height: number }; scaleFactor: number },
): { x: number; y: number } {
  return {
    x: Math.round((d.bounds.x + fx * (d.bounds.width - 1)) * d.scaleFactor),
    y: Math.round((d.bounds.y + fy * (d.bounds.height - 1)) * d.scaleFactor),
  };
}
