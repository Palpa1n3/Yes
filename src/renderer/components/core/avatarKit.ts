/** Shared bits for the avatars: moods (pleased / confused), the user's motion setting, and
 *  colour helpers. No React here, so the phone app can use the engines too. */

export type RGB = [number, number, number];
export type Mood = 'pleased' | 'confused';

let mood: { kind: Mood; at: number } | null = null;
/** Briefly look pleased (a task worked) or confused (misheard / unclear). */
export function setMood(kind: Mood): void {
  mood = { kind, at: Date.now() };
}
/** The current mood and how strong it still is (1 → 0 over about 4 seconds). */
export function moodNow(): { pleased: number; confused: number } {
  if (!mood) return { pleased: 0, confused: 0 };
  const k = Math.max(0, 1 - (Date.now() - mood.at) / 4000);
  if (k === 0) mood = null;
  return { pleased: mood?.kind === 'pleased' ? k : 0, confused: mood?.kind === 'confused' ? k : 0 };
}

/** How much the avatar moves (Settings › Appearance › Avatar), 0.3–2. */
let motion = 1;
export const setAvatarMotion = (m: number): void => {
  motion = Math.min(2, Math.max(0.3, m || 1));
};
export const avatarMotion = (): number => motion;

export const rgba = (c: RGB, a: number): string =>
  `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a))})`;
export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export const ease = (cur: number, target: number, k: number): number => cur + (target - cur) * k;

/** "#3fd0ff" → "63 208 255" (CSS rgb channels), or '' if it isn't a colour. */
export function hexToChannels(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '';
  const n = parseInt(m[1] ?? '', 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Read "r g b" CSS variables (from the element, so a per-avatar colour override applies). */
export function cssRgb(el: Element, name: string, fallback: RGB): RGB {
  const parts = getComputedStyle(el).getPropertyValue(name).trim().split(/\s+/).map(Number);
  return parts.length === 3 && parts.every((n) => Number.isFinite(n)) ? (parts as RGB) : fallback;
}

/** Does this reply sound like it didn't understand? (→ confused look) */
export const soundsConfused = (text: string): boolean =>
  /\b(not sure what you mean|didn'?t (quite )?catch|did you mean|could you (say|repeat)|sorry,? (i )?(didn'?t|don'?t) (understand|follow)|what do you mean)\b/i.test(
    text,
  );
