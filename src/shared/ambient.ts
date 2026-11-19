/** The HUD's ambient look: weather you can see, colours that follow the time of day, and
 *  seasonal touches. Pure helpers (tested); drawing lives in the renderer. */

export type Precip = 'none' | 'rain' | 'snow';

/** WMO weather codes → what's falling. */
export function precipFor(code: number): Precip {
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return 'rain';
  return 'none';
}

/** Cold enough for frost on the edges (°C). */
export const isFrosty = (tempC: number): boolean => tempC <= 3;

export const toC = (t: number, unit: 'c' | 'f'): number => (unit === 'f' ? ((t - 32) * 5) / 9 : t);

/** Sunset glow strength 0–1: builds over the hour before sunset, fades 40 min after. */
export function sunsetGlow(now: Date, sunsetIso: string | null): number {
  if (!sunsetIso) return 0;
  const s = new Date(sunsetIso).getTime();
  if (!Number.isFinite(s)) return 0;
  const d = (now.getTime() - s) / 60_000; // minutes after sunset (negative = before)
  if (d < -60 || d > 40) return 0;
  return d <= 0 ? 1 + d / 60 : 1 - d / 40;
}

export type DayPhase = 'morning' | 'day' | 'evening' | 'night';
export function dayPhase(hour: number): DayPhase {
  if (hour >= 5 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 17) return 'day';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

/** A soft colour cast over the HUD ("r g b", strength) and how much to dim it. */
export function tintFor(phase: DayPhase): { color: string; alpha: number; dim: number } {
  switch (phase) {
    case 'morning':
      return { color: '120 190 255', alpha: 0.1, dim: 0 }; // cool, fresh
    case 'evening':
      return { color: '255 160 70', alpha: 0.13, dim: 0.04 }; // warm amber
    case 'night':
      return { color: '60 80 160', alpha: 0.08, dim: 0.18 }; // dim and deep blue
    default:
      return { color: '0 0 0', alpha: 0, dim: 0 };
  }
}

/** December: snow and a frosty palette. */
export const isFestive = (d: Date): boolean => d.getMonth() === 11;
