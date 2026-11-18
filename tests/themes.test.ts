/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEMES, THEME_TOKENS, applyTheme, hexToChannels } from '@renderer/themes/themes';

describe('themes', () => {
  it('every theme defines every token as a 6-digit hex', () => {
    for (const theme of Object.values(THEMES)) {
      for (const token of THEME_TOKENS) expect(theme.colors[token]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('tokens.css first-paint defaults match the Arc Cyan theme', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/renderer/themes/tokens.css'), 'utf8');
    for (const token of THEME_TOKENS) {
      const m = css.match(new RegExp(`--${token}:\\s*([0-9 ]+);`));
      expect(m?.[1], token).toBe(hexToChannels(THEMES['arc-cyan'].colors[token]));
    }
  });

  it('applyTheme only swaps CSS variables', () => {
    const el = document.createElement('div');
    applyTheme('crimson', el);
    expect(el.style.getPropertyValue('--accent')).toBe('255 59 78');
    expect(el.dataset['theme']).toBe('crimson');
  });
});
