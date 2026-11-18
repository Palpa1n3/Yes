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
