/** Interface customisation shared by the PC and the phone app: font, glass panels, chat look,
 *  tab bar, spacing and motion. Stored as one object (`uiStyle`), applied as attributes and
 *  CSS variables on <html> (see ui-style.css), so it costs nothing while the app runs.
 *  Every default leaves the app looking exactly as it did before. */

export interface UiStyle {
  font: 'standard' | 'futuristic' | 'scifi' | 'terminal' | 'system' | 'classic';
  /** Panel see-through: 100 = as designed, lower shows more of the background. */
  glass: number;
  /** Blur behind panels, px (0 = as designed). */
  blur: number;
  /** Panel glow: 1 = as designed, 0 none, up to 3. */
  glow: number;
  bubble: 'standard' | 'round' | 'square' | 'plain';
  bubbleColour: 'standard' | 'accent' | 'grey' | 'clear';
  width: 'narrow' | 'normal' | 'wide';
  side: 'right' | 'left';
  times: boolean;
  tabs: 'labels' | 'icons';
  spacing: 'compact' | 'normal' | 'roomy';
  motion: 'normal' | 'fast' | 'off';
}

export const DEFAULT_UI_STYLE: UiStyle = {
  font: 'standard',
  glass: 100,
  blur: 0,
  glow: 1,
  bubble: 'standard',
  bubbleColour: 'standard',
  width: 'normal',
  side: 'right',
  times: false,
  tabs: 'labels',
  spacing: 'normal',
  motion: 'normal',
};

/** Font stacks: the bundled fonts first (Rajdhani, Orbitron, Inter, JetBrains Mono), then what
 *  Windows and Android have built in. */
export const FONT_STACKS: Record<UiStyle['font'], string> = {
  standard: '',
  futuristic: "'Rajdhani', 'Bahnschrift', 'sans-serif-condensed', 'Arial Narrow', sans-serif",
  scifi: "'Orbitron', 'Rajdhani', 'Bahnschrift', sans-serif",
  terminal: "'JetBrains Mono', 'Cascadia Code', 'Consolas', 'Roboto Mono', monospace",
  system: "system-ui, 'Segoe UI', Roboto, sans-serif",
  classic: "Georgia, 'Noto Serif', 'Times New Roman', serif",
};

type Field =
  | {
      key: keyof UiStyle;
      label: string;
      kind: 'select';
      options: Array<[string, string]>;
      hint?: string;
    }
  | {
      key: keyof UiStyle;
      label: string;
      kind: 'range';
      min: number;
      max: number;
      step: number;
      unit?: string;
      hint?: string;
    }
  | { key: keyof UiStyle; label: string; kind: 'toggle'; hint?: string };

/** The controls, in order and grouped, for both apps' Settings pages. */
export const UI_STYLE_GROUPS: Array<{ title: string; fields: Field[] }> = [
  {
    title: 'Font',
    fields: [
      {
        key: 'font',
        label: 'Font',
        kind: 'select',
        options: [
          ['standard', 'Standard'],
          ['futuristic', 'Futuristic (narrow)'],
          ['scifi', 'Sci-fi (wide)'],
          ['terminal', 'Terminal'],
          ['system', 'System'],
          ['classic', 'Classic'],
        ],
      },
    ],
  },
  {
    title: 'Panels and glass',
    fields: [
      {
        key: 'glass',
        label: 'Panel see-through',
        kind: 'range',
        min: 30,
        max: 100,
        step: 5,
        unit: '%',
        hint: 'Lower lets the background show through the panels.',
      },
      { key: 'blur', label: 'Frosted blur', kind: 'range', min: 0, max: 20, step: 1, unit: 'px' },
      { key: 'glow', label: 'Glow', kind: 'range', min: 0, max: 3, step: 0.5, unit: '×' },
    ],
  },
  {
    title: 'Chat',
    fields: [
      {
        key: 'bubble',
        label: 'Your messages',
        kind: 'select',
        options: [
          ['standard', 'Standard'],
          ['round', 'Round bubble'],
          ['square', 'Square bubble'],
          ['plain', 'Plain text'],
        ],
      },
      {
        key: 'bubbleColour',
        label: 'Bubble colour',
        kind: 'select',
        options: [
          ['standard', 'Standard'],
          ['accent', 'Theme colour'],
          ['grey', 'Grey'],
          ['clear', 'See-through'],
        ],
      },
      {
        key: 'width',
        label: 'Message width',
        kind: 'select',
        options: [
          ['narrow', 'Narrow'],
          ['normal', 'Normal'],
          ['wide', 'Wide'],
        ],
      },
      {
        key: 'side',
        label: 'Your messages on the',
        kind: 'select',
        options: [
          ['right', 'Right'],
          ['left', 'Left'],
        ],
      },
      { key: 'times', label: 'Show times on messages', kind: 'toggle' },
    ],
  },
  {
    title: 'Layout and motion',
    fields: [
      {
        key: 'tabs',
        label: 'Tab bar',
        kind: 'select',
        options: [
          ['labels', 'Icons and names'],
          ['icons', 'Icons only'],
        ],
      },
      {
        key: 'spacing',
        label: 'Spacing',
        kind: 'select',
        options: [
          ['compact', 'Compact'],
          ['normal', 'Normal'],
          ['roomy', 'Roomy'],
        ],
      },
      {
        key: 'motion',
        label: 'Animations',
        kind: 'select',
        options: [
          ['normal', 'Normal'],
          ['fast', 'Quick'],
          ['off', 'Off'],
        ],
      },
    ],
  },
];

const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T =>
  ok.includes(v as T) ? (v as T) : d;
const num = (v: unknown, lo: number, hi: number, d: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

/** Settings from storage or sync, made safe. */
export function cleanUiStyle(raw: unknown): UiStyle {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_UI_STYLE;
  return {
    font: pick(
      o.font,
      ['standard', 'futuristic', 'scifi', 'terminal', 'system', 'classic'],
      d.font,
    ),
    glass: num(o.glass, 30, 100, d.glass),
    blur: num(o.blur, 0, 20, d.blur),
    glow: num(o.glow, 0, 3, d.glow),
    bubble: pick(o.bubble, ['standard', 'round', 'square', 'plain'], d.bubble),
    bubbleColour: pick(o.bubbleColour, ['standard', 'accent', 'grey', 'clear'], d.bubbleColour),
    width: pick(o.width, ['narrow', 'normal', 'wide'], d.width),
    side: pick(o.side, ['right', 'left'], d.side),
    times: typeof o.times === 'boolean' ? o.times : d.times,
    tabs: pick(o.tabs, ['labels', 'icons'], d.tabs),
    spacing: pick(o.spacing, ['compact', 'normal', 'roomy'], d.spacing),
    motion: pick(o.motion, ['normal', 'fast', 'off'], d.motion),
  };
}

/** Put the style on the page: data-* attributes (only for changed options, so defaults leave
 *  the designed look alone) and CSS variables. */
/** Just what applyUiStyle needs from an element (this file is shared with code that has no DOM). */
interface StyleTarget {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  style: { setProperty(name: string, value: string): void };
}

export function applyUiStyle(root: StyleTarget, s: UiStyle): void {
  const d = DEFAULT_UI_STYLE;
  const set = (name: string, on: boolean, value: string): void => {
    if (on) root.setAttribute(`data-ui-${name}`, value);
    else root.removeAttribute(`data-ui-${name}`);
  };
  set('font', s.font !== d.font, s.font);
  root.style.setProperty('--ui-font', FONT_STACKS[s.font] || 'inherit');
  set('glass', s.glass !== d.glass || s.blur !== d.blur, '1');
  root.style.setProperty('--ui-glass', String(s.glass / 100));
  root.style.setProperty('--ui-blur', `${s.blur}px`);
  set('glow', s.glow !== d.glow, '1');
  root.style.setProperty('--ui-glow', String(s.glow));
  set('bubble', s.bubble !== d.bubble, s.bubble);
  set('bubble-colour', s.bubbleColour !== d.bubbleColour, s.bubbleColour);
  set('width', s.width !== d.width, s.width);
  set('side', s.side !== d.side, s.side);
  set('times', s.times, '1');
  set('tabs', s.tabs !== d.tabs, s.tabs);
  set('spacing', s.spacing !== d.spacing, s.spacing);
  set('motion', s.motion !== d.motion, s.motion);
}

/** "14:05" for message times. */
export const msgTime = (at: number): string =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
