import { describe, expect, it } from 'vitest';
import { DEFAULT_UI_STYLE, UI_STYLE_GROUPS, applyUiStyle, cleanUiStyle } from '@shared/ui-style';

describe('interface customisation', () => {
  it('cleans stored values and keeps defaults for anything wrong', () => {
    expect(cleanUiStyle(undefined)).toEqual(DEFAULT_UI_STYLE);
    const s = cleanUiStyle({ font: 'scifi', glass: 5, blur: 99, side: 'up', times: 'yes' });
    expect(s.font).toBe('scifi');
    expect(s.glass).toBe(30);
    expect(s.blur).toBe(20);
    expect(s.side).toBe('right');
    expect(s.times).toBe(false);
  });
  it('marks only changed options on the page, so defaults keep the designed look', () => {
    const root = document.createElement('html');
    applyUiStyle(root, DEFAULT_UI_STYLE);
    expect([...root.attributes].filter((a) => a.name.startsWith('data-ui-'))).toHaveLength(0);
    applyUiStyle(root, cleanUiStyle({ font: 'terminal', glass: 60, side: 'left', times: true }));
    expect(root.getAttribute('data-ui-font')).toBe('terminal');
    expect(root.getAttribute('data-ui-glass')).toBe('1');
    expect(root.style.getPropertyValue('--ui-glass')).toBe('0.6');
    expect(root.getAttribute('data-ui-side')).toBe('left');
    expect(root.hasAttribute('data-ui-times')).toBe(true);
    applyUiStyle(root, DEFAULT_UI_STYLE);
    expect(root.hasAttribute('data-ui-font')).toBe(false);
  });
  it('has a control for every option', () => {
    const keys = UI_STYLE_GROUPS.flatMap((g) => g.fields.map((f) => f.key)).sort();
    expect(keys).toEqual(Object.keys(DEFAULT_UI_STYLE).sort());
  });
});
