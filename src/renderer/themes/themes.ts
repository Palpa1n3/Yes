import type { ThemeId } from '@shared/types';

/** Every themeable token. Values are hex; they are written to CSS variables as
 *  space-separated RGB channels so Tailwind opacity modifiers work. */
export const THEME_TOKENS = [
  'bg-void',
  'bg-panel',
  'bg-panel-raised',
  'line',
  'accent',
  'ice',
  'text-primary',
  'text-muted',
  'amber',
  'alert',
  'ok',
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];

export interface Theme {
  id: ThemeId;
  name: string;
  colors: Record<ThemeToken, string>;
}

export const THEMES: Record<ThemeId, Theme> = {
  'arc-cyan': {
    id: 'arc-cyan',
    name: 'Arc Cyan',
    colors: {
      'bg-void': '#05080D',
      'bg-panel': '#0A1220',
      'bg-panel-raised': '#0F1B2E',
      line: '#1C3A5A',
      accent: '#3FD0FF',
      ice: '#BFEFFF',
      'text-primary': '#D8E6F3',
      'text-muted': '#6B8299',
      amber: '#FFB547',
      alert: '#FF4D5E',
      ok: '#3DFFB0',
    },
  },
  'solar-gold': {
    id: 'solar-gold',
    name: 'Solar Gold',
    colors: {
      'bg-void': '#0A0805',
      'bg-panel': '#17110A',
      'bg-panel-raised': '#221A0F',
      line: '#4A3A1C',
      accent: '#FFC857',
      ice: '#FFEBC2',
      'text-primary': '#F0E6D6',
      'text-muted': '#9A8A72',
      amber: '#FF8A3D',
      alert: '#FF4D5E',
      ok: '#3DFFB0',
    },
  },
  crimson: {
    id: 'crimson',
    name: 'Crimson',
    colors: {
      'bg-void': '#0A0506',
      'bg-panel': '#1A0B0E',
      'bg-panel-raised': '#251014',
      line: '#4A1C24',
      accent: '#FF3B4E',
      ice: '#FFC9CF',
      'text-primary': '#F0DCDF',
      'text-muted': '#A07C82',
      amber: '#FFB547',
      alert: '#FF7A45',
      ok: '#3DFFB0',
    },
  },
  sentinel: {
    id: 'sentinel',
    name: 'Sentinel',
    colors: {
      'bg-void': '#07080B',
      'bg-panel': '#0E1116',
      'bg-panel-raised': '#161A21',
      line: '#2C333F',
      accent: '#FF2E3F',
      ice: '#E8EDF3',
      'text-primary': '#D9DEE5',
      'text-muted': '#7D8693',
      amber: '#FFB547',
      alert: '#FF7A45',
      ok: '#3DFFB0',
    },
  },
  violet: {
    id: 'violet',
    name: 'Violet',
    colors: {
      'bg-void': '#07050D',
      'bg-panel': '#120C20',
      'bg-panel-raised': '#1A122E',
      line: '#33265A',
      accent: '#A97BFF',
      ice: '#E4D8FF',
      'text-primary': '#E2DCF0',
      'text-muted': '#8A80A3',
      amber: '#FFB547',
      alert: '#FF4D5E',
      ok: '#3DFFB0',
    },
  },
  mono: {
    id: 'mono',
    name: 'Mono',
    colors: {
      'bg-void': '#000000',
      'bg-panel': '#0D0D0D',
      'bg-panel-raised': '#161616',
      line: '#333333',
      accent: '#FFFFFF',
      ice: '#FFFFFF',
      'text-primary': '#E6E6E6',
      'text-muted': '#8C8C8C',
      amber: '#E0C080',
      alert: '#FF6B6B',
      ok: '#9AE6B4',
    },
  },
  'event-horizon': {
    id: 'event-horizon',
    name: 'Event Horizon',
    colors: {
      'bg-void': '#070403',
      'bg-panel': '#140B06',
      'bg-panel-raised': '#1E1209',
      line: '#4E3218',
      accent: '#FFB45C',
      ice: '#FFE6C4',
      'text-primary': '#F2E6DA',
      'text-muted': '#9C8571',
      amber: '#FFC857',
      alert: '#FF4D5E',
      ok: '#3DFFB0',
    },
  },
  'deep-space': {
    id: 'deep-space',
    name: 'Deep Space',
    colors: {
      'bg-void': '#02040A',
      'bg-panel': '#070D1A',
      'bg-panel-raised': '#0C1526',
      line: '#1E2E4D',
      accent: '#9EC3FF',
      ice: '#E3EEFF',
      'text-primary': '#DCE6F5',
      'text-muted': '#6E7F9A',
      amber: '#FFB547',
      alert: '#FF4D5E',
      ok: '#3DFFB0',
    },
  },
  nebula: {
    id: 'nebula',
    name: 'Nebula',
    colors: {
      'bg-void': '#07030C',
      'bg-panel': '#12081C',
      'bg-panel-raised': '#1B0D29',
      line: '#43205E',
      accent: '#FF5FD2',
      ice: '#FFD3F3',
      'text-primary': '#EEDDF2',
      'text-muted': '#957AA3',
      amber: '#FFB547',
      alert: '#FF5A5A',
      ok: '#3DFFB0',
    },
  },
  exoplanet: {
    id: 'exoplanet',
    name: 'Exoplanet',
    colors: {
      'bg-void': '#020807',
      'bg-panel': '#061512',
      'bg-panel-raised': '#0A201B',
      line: '#154A3F',
      accent: '#3BE8C0',
      ice: '#C6FFF0',
      'text-primary': '#D8F2EC',
      'text-muted': '#6C978D',
      amber: '#FFC857',
      alert: '#FF4D5E',
      ok: '#8BFF6B',
    },
  },
};

export function hexToChannels(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Swaps CSS variables only — components never change. */
export function applyTheme(id: ThemeId, root: HTMLElement = document.documentElement): void {
  const theme = THEMES[id];
  for (const token of THEME_TOKENS) {
    root.style.setProperty(`--${token}`, hexToChannels(theme.colors[token]));
  }
  root.dataset['theme'] = id;
}
