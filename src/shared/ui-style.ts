/** Interface customisation shared by the PC and the phone app: font, glass panels, chat look,
 *  tab bar, spacing and motion. Stored as one object (`uiStyle`), applied as attributes and
 *  CSS variables on <html> (see ui-style.css), so it costs nothing while the app runs.
 *  Every default leaves the app looking as designed, except that backgrounds move gently
 *  (Background › Moving background: Calm), which can be switched off. */

export interface UiStyle {
  font: 'standard' | 'futuristic' | 'scifi' | 'terminal' | 'system' | 'classic';
  /** Panel see-through: 100 = as designed, lower shows more of the background. */
  glass: number;
  /** Blur behind panels, px (0 = as designed). */
  blur: number;
  /** Panel glow: 1 = as designed, 0 none, up to 3. */
  glow: number;
  /** A colour cast in the glass. */
  tint: 'none' | 'theme' | 'warm' | 'cool' | 'dark';
  border: 'standard' | 'none' | 'bold' | 'neon' | 'pulse';
  /** Colour boost behind frosted glass, % (100 = none). */
  vivid: number;
  /** Darken the background behind everything, % (0 = none). */
  dim: number;
  bubble: 'standard' | 'round' | 'square' | 'plain';
  bubbleColour: 'standard' | 'accent' | 'grey' | 'clear';
  width: 'narrow' | 'normal' | 'wide';
  side: 'right' | 'left';
  times: boolean;
  tabs: 'labels' | 'icons';
  spacing: 'compact' | 'normal' | 'roomy';
  motion: 'normal' | 'fast' | 'off';
  /** Moving background layer (stars twinkling, the scene's own effect). */
  bgMotion: 'off' | 'calm' | 'lively';
  shooting: boolean;
  /** The background shifts a little with the mouse or the phone's tilt. */
  parallax: boolean;
  /** Bolder text everywhere. */
  weight: 'normal' | 'bold';
  shadow: 'standard' | 'soft' | 'deep';
  /** Panels rise a little under the mouse / finger. */
  lift: boolean;
  /** How new messages come in. */
  enter: 'standard' | 'slide' | 'pop' | 'fade' | 'none';
  /** Alton's answers: as designed, or in their own panel. */
  aiStyle: 'standard' | 'card';
  /** Chat text size, %. */
  chatSize: number;
  scrollbar: 'standard' | 'thin' | 'hidden';
  /** A glow round the message box while typing. */
  focusGlow: boolean;
}

export const DEFAULT_UI_STYLE: UiStyle = {
  font: 'standard',
  glass: 100,
  blur: 0,
  glow: 1,
  tint: 'none',
  border: 'standard',
  vivid: 100,
  dim: 0,
  bubble: 'standard',
  bubbleColour: 'standard',
  width: 'normal',
  side: 'right',
  times: false,
  tabs: 'labels',
  spacing: 'normal',
  motion: 'normal',
  bgMotion: 'calm',
  shooting: true,
  parallax: false,
  weight: 'normal',
  shadow: 'standard',
  lift: false,
  enter: 'standard',
  aiStyle: 'standard',
  chatSize: 100,
  scrollbar: 'standard',
  focusGlow: false,
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
    title: 'Moving background',
    fields: [
      {
        key: 'bgMotion',
        label: 'Moving background',
        kind: 'select',
        options: [
          ['calm', 'Calm'],
          ['lively', 'Lively'],
          ['off', 'Still'],
        ],
        hint: 'Twinkling stars and each scene’s own motion: the black hole’s disc turning, gas falling into the wormhole, the sun’s glare. Uses very little battery.',
      },
      { key: 'shooting', label: 'Shooting stars', kind: 'toggle' },
      {
        key: 'parallax',
        label: 'Move with the mouse or phone tilt',
        kind: 'toggle',
        hint: 'The background shifts a few pixels, for a sense of depth.',
      },
    ],
  },
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
      {
        key: 'weight',
        label: 'Text weight',
        kind: 'select',
        options: [
          ['normal', 'Normal'],
          ['bold', 'Bolder'],
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
      {
        key: 'tint',
        label: 'Glass tint',
        kind: 'select',
        options: [
          ['none', 'None'],
          ['theme', 'Theme colour'],
          ['warm', 'Warm'],
          ['cool', 'Cool'],
          ['dark', 'Dark'],
        ],
      },
      {
        key: 'border',
        label: 'Panel border',
        kind: 'select',
        options: [
          ['standard', 'Standard'],
          ['none', 'None'],
          ['bold', 'Bold'],
          ['neon', 'Neon'],
          ['pulse', 'Neon, breathing'],
        ],
      },
      {
        key: 'shadow',
        label: 'Panel shadow',
        kind: 'select',
        options: [
          ['standard', 'Standard'],
          ['soft', 'Soft'],
          ['deep', 'Deep (floating)'],
        ],
      },
      { key: 'lift', label: 'Panels lift when touched', kind: 'toggle' },
      {
        key: 'vivid',
        label: 'Colour boost',
        kind: 'range',
        min: 100,
        max: 200,
        step: 10,
        unit: '%',
        hint: 'Makes colours behind frosted glass richer.',
      },
      {
        key: 'dim',
        label: 'Dim the background',
        kind: 'range',
        min: 0,
        max: 80,
        step: 5,
        unit: '%',
        hint: 'Darkens the background behind everything, for easier reading.',
      },
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
      {
        key: 'aiStyle',
        label: 'Alton’s answers',
        kind: 'select',
        options: [
          ['standard', 'Standard'],
          ['card', 'In a panel'],
        ],
      },
      {
        key: 'enter',
        label: 'New messages',
        kind: 'select',
        options: [
          ['standard', 'Standard'],
          ['slide', 'Slide in'],
          ['pop', 'Pop'],
          ['fade', 'Fade'],
          ['none', 'Just appear'],
        ],
      },
      {
        key: 'chatSize',
        label: 'Chat text size',
        kind: 'range',
        min: 85,
        max: 130,
        step: 5,
        unit: '%',
      },
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
      {
        key: 'scrollbar',
        label: 'Scroll bars',
        kind: 'select',
        options: [
          ['standard', 'Standard'],
          ['thin', 'Thin, in the theme colour'],
          ['hidden', 'Hidden'],
        ],
      },
      { key: 'focusGlow', label: 'Glow round the message box while typing', kind: 'toggle' },
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
    tint: pick(o.tint, ['none', 'theme', 'warm', 'cool', 'dark'], d.tint),
    border: pick(o.border, ['standard', 'none', 'bold', 'neon', 'pulse'], d.border),
    vivid: num(o.vivid, 100, 200, d.vivid),
    dim: num(o.dim, 0, 80, d.dim),
    bubble: pick(o.bubble, ['standard', 'round', 'square', 'plain'], d.bubble),
    bubbleColour: pick(o.bubbleColour, ['standard', 'accent', 'grey', 'clear'], d.bubbleColour),
    width: pick(o.width, ['narrow', 'normal', 'wide'], d.width),
    side: pick(o.side, ['right', 'left'], d.side),
    times: typeof o.times === 'boolean' ? o.times : d.times,
    tabs: pick(o.tabs, ['labels', 'icons'], d.tabs),
    spacing: pick(o.spacing, ['compact', 'normal', 'roomy'], d.spacing),
    motion: pick(o.motion, ['normal', 'fast', 'off'], d.motion),
    bgMotion: pick(o.bgMotion, ['off', 'calm', 'lively'], d.bgMotion),
    shooting: typeof o.shooting === 'boolean' ? o.shooting : d.shooting,
    parallax: typeof o.parallax === 'boolean' ? o.parallax : d.parallax,
    weight: pick(o.weight, ['normal', 'bold'], d.weight),
    shadow: pick(o.shadow, ['standard', 'soft', 'deep'], d.shadow),
    lift: typeof o.lift === 'boolean' ? o.lift : d.lift,
    enter: pick(o.enter, ['standard', 'slide', 'pop', 'fade', 'none'], d.enter),
    aiStyle: pick(o.aiStyle, ['standard', 'card'], d.aiStyle),
    chatSize: num(o.chatSize, 85, 130, d.chatSize),
    scrollbar: pick(o.scrollbar, ['standard', 'thin', 'hidden'], d.scrollbar),
    focusGlow: typeof o.focusGlow === 'boolean' ? o.focusGlow : d.focusGlow,
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
  set(
    'glass',
    s.glass !== d.glass || s.blur !== d.blur || s.tint !== d.tint || s.vivid !== d.vivid,
    '1',
  );
  set('tint', s.tint !== d.tint, s.tint);
  root.style.setProperty(
    '--ui-tint-amt',
    s.tint === 'none' ? '0%' : s.tint === 'dark' ? '30%' : '18%',
  );
  root.style.setProperty('--ui-vivid', `${s.vivid}%`);
  set('border', s.border !== d.border, s.border);
  set('dim', s.dim !== d.dim, '1');
  root.style.setProperty('--ui-dim', String(s.dim / 100));
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
  set('weight', s.weight !== d.weight, s.weight);
  set('shadow', s.shadow !== d.shadow, s.shadow);
  set('lift', s.lift, '1');
  set('enter', s.enter !== d.enter, s.enter);
  set('ai', s.aiStyle !== d.aiStyle, s.aiStyle);
  set('chat-size', s.chatSize !== d.chatSize, '1');
  root.style.setProperty('--ui-chat-size', String(s.chatSize / 100));
  set('scrollbar', s.scrollbar !== d.scrollbar, s.scrollbar);
  set('focus', s.focusGlow, '1');
}

/** "14:05" for message times. */
export const msgTime = (at: number): string =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
