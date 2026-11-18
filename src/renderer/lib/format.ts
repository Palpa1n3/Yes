const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export function fmtBytes(bytes: number, digits = 1): string {
  let v = Math.max(0, bytes);
  let i = 0;
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : v >= 100 ? 0 : digits)} ${UNITS[i]}`;
}

export const fmtRate = (bytesPerSec: number): string => `${fmtBytes(bytesPerSec)}/s`;

export const pad2 = (n: number): string => String(Math.floor(n)).padStart(2, '0');

export function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}D ${h}H` : `${h}H ${pad2(m)}M`;
}

export function fmtClock(d: Date, seconds = true): string {
  const base = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return seconds ? `${base}:${pad2(d.getSeconds())}` : base;
}

export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `T-${pad2(s / 3600)}:${pad2((s % 3600) / 60)}:${pad2(s % 60)}`;
}

export const clamp = (v: number, lo = 0, hi = 100): number => Math.min(hi, Math.max(lo, v));

/** Threshold tone for a 0–100 load/usage value. */
export function loadTone(pct: number, warn = 75, crit = 90): 'accent' | 'amber' | 'alert' {
  if (pct >= crit) return 'alert';
  if (pct >= warn) return 'amber';
  return 'accent';
}
