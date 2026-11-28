/** PC lighting (RGB): colour names, brightness, and picking devices by name. The lights are
 *  controlled through OpenRGB (services/openrgb.ts). Pure; tested in tests/lights.test.ts. */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface LightDevice {
  index: number;
  name: string;
  /** e.g. "Motherboard", "DRAM", "Mouse". */
  type: string;
  leds: number;
}

/** OpenRGB's device types. */
export const DEVICE_TYPES = [
  'Motherboard',
  'DRAM',
  'GPU',
  'Cooler',
  'LED strip',
  'Keyboard',
  'Mouse',
  'Mouse mat',
  'Headset',
  'Headset stand',
  'Gamepad',
  'Light',
  'Speaker',
  'Virtual',
  'Storage',
  'Case',
  'Microphone',
  'Accessory',
  'Keypad',
  'Laptop',
  'Monitor',
];

const NAMED: Record<string, string> = {
  white: 'ffffff',
  'warm white': 'ffb46b',
  warm: 'ffb46b',
  'cool white': 'd6e4ff',
  red: 'ff0000',
  green: '00ff00',
  blue: '0000ff',
  'light blue': '4fc3ff',
  'sky blue': '4fc3ff',
  cyan: '00ffff',
  teal: '00b3a4',
  turquoise: '30e0c8',
  purple: '8000ff',
  violet: 'a050ff',
  magenta: 'ff00ff',
  pink: 'ff3fa4',
  'hot pink': 'ff1493',
  orange: 'ff6a00',
  amber: 'ffaa00',
  yellow: 'ffdd00',
  gold: 'ffc400',
  lime: '80ff00',
  mint: '50ffb0',
  indigo: '4b00ff',
  'deep blue': '0010ff',
  'ice blue': '9fdcff',
};

/** "red", "#ff8800", "ff8800", "rgb(255, 136, 0)" → colour (null if not understood). */
export function parseColor(input: string): Rgb | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, ' ');
  const hex = NAMED[s] ?? NAMED[s.replace(/ colou?r$/, '')] ?? /^#?([0-9a-f]{6})$/.exec(s)?.[1];
  if (hex)
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    };
  const m = /^rgb\(?\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)?$/.exec(s);
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)));
    return { r: r ?? 0, g: g ?? 0, b: b ?? 0 };
  }
  return null;
}

export const toHex = (c: Rgb): string =>
  `#${[c.r, c.g, c.b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;

/** A colour at a brightness (0–100). */
export function atBrightness(c: Rgb, pct: number): Rgb {
  const k = Math.max(0, Math.min(100, pct)) / 100;
  return { r: Math.round(c.r * k), g: Math.round(c.g * k), b: Math.round(c.b * k) };
}

const ALIASES: Record<string, string[]> = {
  ram: ['dram', 'memory', 'ram'],
  memory: ['dram', 'memory', 'ram'],
  motherboard: ['motherboard', 'mainboard', 'aura'],
  'graphics card': ['gpu', 'graphics'],
  gpu: ['gpu', 'graphics'],
  fans: ['cooler', 'fan', 'led strip'],
  fan: ['cooler', 'fan'],
  cooler: ['cooler', 'aio'],
  strip: ['led strip', 'strip'],
  keyboard: ['keyboard'],
  mouse: ['mouse'],
  headset: ['headset'],
  ssd: ['storage', 'ssd'],
  storage: ['storage', 'ssd'],
  case: ['case'],
};

/** The devices a phrase means ("RAM", "the mouse", "Razer"); every device for ""/"all". */
export function matchDevices<T extends LightDevice>(devices: T[], query = ''): T[] {
  const q = query
    .trim()
    .toLowerCase()
    .replace(/^(the|my)\s+/, '')
    .replace(/\s+(lights?|leds?|rgb)$/, '');
  if (!q || /^(all|everything|pc|computer|every ?thing)$/.test(q)) return devices;
  const words = ALIASES[q] ?? [q];
  return devices.filter((d) => {
    const hay = `${d.name} ${d.type}`.toLowerCase();
    return words.some((w) => hay.includes(w));
  });
}
