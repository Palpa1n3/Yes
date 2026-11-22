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
  'event-horizon': '#FFB45C',
  'deep-space': '#9EC3FF',
  nebula: '#FF5FD2',
  exoplanet: '#3BE8C0',
};

/** Every PC avatar runs on the phone too (plus "none"). */
export type PhoneAvatar = AvatarStyle | 'none';
export const PHONE_AVATARS: Array<{ id: PhoneAvatar; label: string }> = [
  { id: 'rings', label: 'Holo rings' },
  { id: 'face', label: 'Face' },
  { id: 'code', label: 'Code ring' },
  { id: 'sphere', label: 'Data sphere (gold)' },
  { id: 'cloud', label: 'Data cloud (blue)' },
  { id: 'orb', label: 'Liquid orb' },
  { id: 'swarm', label: 'Particle swarm' },
  { id: 'wave', label: 'Sound wave' },
  { id: 'head', label: 'Wireframe head' },
  { id: 'none', label: 'None' },
];
export const isPhoneAvatar = (a: unknown): a is PhoneAvatar =>
  PHONE_AVATARS.some((x) => x.id === a);

export function phoneAvatarFor(a: AvatarStyle): PhoneAvatar {
  return a;
}

export const THEME_NAMES: Record<ThemeId, string> = {
  'arc-cyan': 'Arc cyan',
  'solar-gold': 'Solar gold',
  crimson: 'Crimson',
  sentinel: 'Sentinel',
  violet: 'Violet',
  mono: 'Mono',
  'event-horizon': 'Event horizon',
  'deep-space': 'Deep space',
  nebula: 'Nebula',
  exoplanet: 'Exoplanet',
};

/** One-tap space looks: colours, background and avatar that go together. */
export const SPACE_LOOKS: Array<{
  id: string;
  name: string;
  theme: ThemeId;
  backdrop: import('./backdrops').SpaceBackdrop;
  avatar: AvatarStyle;
}> = [
  {
    id: 'blackhole',
    name: 'Black hole',
    theme: 'event-horizon',
    backdrop: 'horizon',
    avatar: 'sphere',
  },
  { id: 'wormhole', name: 'Wormhole', theme: 'deep-space', backdrop: 'wormhole', avatar: 'cloud' },
  { id: 'orbit', name: 'From orbit', theme: 'deep-space', backdrop: 'orbit', avatar: 'orb' },
  { id: 'deepfield', name: 'Deep field', theme: 'nebula', backdrop: 'deepfield', avatar: 'swarm' },
];
