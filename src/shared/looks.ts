/** Theme accent colours (kept in step with src/renderer/themes/themes.ts), so the PC can tell
 *  the phone app how to look. */
import type { AvatarStyle, ThemeId } from './types';

export const THEME_ACCENT: Record<ThemeId, string> = {
  'arc-cyan': '#3FD0FF',
  'solar-gold': '#FFC857',
  crimson: '#FF3B4E',
  sentinel: '#FF2E3F',
  violet: '#A97BFF',
  mono: '#FFFFFF',
};

export type PhoneAvatar = 'orb' | 'swarm' | 'wave' | 'head' | 'none';

/** The phone draws the four canvas avatars; the PC-only ones map to the closest. */
export function phoneAvatarFor(a: AvatarStyle): PhoneAvatar {
  if (a === 'wave' || a === 'swarm' || a === 'orb' || a === 'head') return a;
  if (a === 'sphere' || a === 'cloud') return 'orb';
  if (a === 'face') return 'head';
  return 'swarm';
}
