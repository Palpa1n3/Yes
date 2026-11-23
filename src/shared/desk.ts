/** Desktop widget and taskbar: settings, the data the windows show (one snapshot pushed from
 *  main), and the pure decisions (layout, snapping, overlay badge, taskbar progress, tray
 *  tooltip, PC warnings). Tested in tests/desk.test.ts. */
import type { HourForecast } from './weather';

export const TILE_IDS = ['alton', 'music', 'work', 'health', 'weather', 'today', 'phone'] as const;
export type TileId = (typeof TILE_IDS)[number];
export const TILE_LABELS: Record<TileId, string> = {
  alton: 'Alton (talk)',
  music: 'Now playing',
  work: 'Work and payday',
  health: 'PC health',
  weather: 'Weather',
  today: 'Today (timers, reminders, list)',
  phone: 'Phone',
};

export const STRIP_ITEMS = ['music', 'shift', 'cpu', 'weather'] as const;
export type StripItem = (typeof STRIP_ITEMS)[number];

export type Corner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

export interface DeskSettings {
  style: 'glass' | 'hud';
  size: 'small' | 'medium' | 'large';
  /** In order; `on` = shown (Medium shows the first two that are on). */
  tiles: Array<{ id: TileId; on: boolean }>;
  corner: Corner;
  /** Display id the widget sits on (null = the main screen). */
  display: number | null;
  locked: boolean;
  /** 30–100 %. */
  opacity: number;
  /** Hide in gaming mode or when an app is full-screen. */
  autoHide: boolean;
  thumbar: boolean;
  jumpList: boolean;
  overlay: boolean;
  progress: boolean;
  trayLive: boolean;
  strip: {
    on: boolean;
    place: 'left' | 'centre' | 'right';
    display: number | null;
    items: StripItem[];
  };
}

export const DEFAULT_DESK: DeskSettings = {
  style: 'glass',
  size: 'large',
  tiles: TILE_IDS.map((id) => ({ id, on: true })),
  corner: 'top-right',
  display: null,
  locked: false,
  opacity: 100,
  autoHide: true,
  thumbar: true,
  jumpList: true,
  overlay: true,
  progress: true,
  trayLive: true,
  strip: { on: false, place: 'right', display: null, items: ['music', 'shift', 'cpu', 'weather'] },
};

const obj = (x: unknown): Record<string, unknown> =>
  x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T =>
  ok.includes(v as T) ? (v as T) : d;
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const disp = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export function cleanDesk(raw: unknown): DeskSettings {
  const o = obj(raw);
  const d = DEFAULT_DESK;
  // Tiles: keep the saved order, drop unknown ones, add any new ones at the end.
  const seen = new Set<TileId>();
  const tiles: DeskSettings['tiles'] = [];
  for (const t of Array.isArray(o.tiles) ? o.tiles : []) {
    const x = obj(t);
    const id = x.id as TileId;
    if (!TILE_IDS.includes(id) || seen.has(id)) continue;
    seen.add(id);
    tiles.push({ id, on: bool(x.on, true) });
  }
  for (const id of TILE_IDS) if (!seen.has(id)) tiles.push({ id, on: true });
  const s = obj(o.strip);
  const items = (Array.isArray(s.items) ? s.items : d.strip.items).filter(
    (i, k, a): i is StripItem => STRIP_ITEMS.includes(i as StripItem) && a.indexOf(i) === k,
  );
  return {
    style: pick(o.style, ['glass', 'hud'], d.style),
    size: pick(o.size, ['small', 'medium', 'large'], d.size),
    tiles,
    corner: pick(o.corner, ['top-right', 'top-left', 'bottom-right', 'bottom-left'], d.corner),
    display: disp(o.display),
    locked: bool(o.locked, d.locked),
    opacity:
      typeof o.opacity === 'number' && Number.isFinite(o.opacity)
        ? Math.min(100, Math.max(30, Math.round(o.opacity)))
        : d.opacity,
    autoHide: bool(o.autoHide, d.autoHide),
    thumbar: bool(o.thumbar, d.thumbar),
    jumpList: bool(o.jumpList, d.jumpList),
    overlay: bool(o.overlay, d.overlay),
    progress: bool(o.progress, d.progress),
    trayLive: bool(o.trayLive, d.trayLive),
    strip: {
      on: bool(s.on, d.strip.on),
      place: pick(s.place, ['left', 'centre', 'right'], d.strip.place),
      display: disp(s.display),
      items,
    },
  };
}

/** Which tiles show at a size: Small = clock only, Medium = the first two, Large = all on. */
export function tilesForSize(d: Pick<DeskSettings, 'tiles' | 'size'>): TileId[] {
  const on = d.tiles.filter((t) => t.on).map((t) => t.id);
  return d.size === 'small' ? [] : d.size === 'medium' ? on.slice(0, 2) : on;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where a window of this size goes in a corner of a work area. */
export function cornerPosition(
  corner: Corner,
  area: Rect,
  size: { width: number; height: number },
  margin = 12,
): { x: number; y: number } {
  const right = corner.endsWith('right');
  const bottom = corner.startsWith('bottom');
  return {
    x: Math.round(right ? area.x + area.width - size.width - margin : area.x + margin),
    y: Math.round(bottom ? area.y + area.height - size.height - margin : area.y + margin),
  };
}

/** The corner nearest a window's centre (after it was dragged). */
export function nearestCorner(win: Rect, area: Rect): Corner {
  const cx = win.x + win.width / 2;
  const cy = win.y + win.height / 2;
  const right = cx > area.x + area.width / 2;
  const bottom = cy > area.y + area.height / 2;
  return `${bottom ? 'bottom' : 'top'}-${right ? 'right' : 'left'}` as Corner;
}

/** The taskbar strip: a thin window just above the taskbar (or under it when it's at the
 *  top), at the left, centre or right of the work area. */
export function stripBounds(
  display: Rect,
  area: Rect,
  place: 'left' | 'centre' | 'right',
  size: { width: number; height: number },
): Rect {
  const width = Math.min(size.width, area.width - 16);
  const x =
    place === 'left'
      ? area.x + 8
      : place === 'right'
        ? area.x + area.width - width - 8
        : Math.round(area.x + (area.width - width) / 2);
  const taskbarOnTop = area.y > display.y;
  const y = taskbarOnTop ? area.y + 4 : area.y + area.height - size.height - 4;
  return { x, y, width, height: size.height };
}

export type Overlay = 'approval' | 'listening' | 'thinking' | 'warning' | null;

/** The taskbar badge: needs-you first, then what Alton is doing, then a PC warning. */
export function overlayFor(s: {
  assistant: string;
  agentWaiting: boolean;
  warning: string | null;
}): Overlay {
  if (s.agentWaiting) return 'approval';
  if (s.assistant === 'listening') return 'listening';
  if (s.assistant === 'thinking' || s.assistant === 'executing') return 'thinking';
  if (s.warning) return 'warning';
  return null;
}

export interface ProgressSource {
  timer: { createdAt: number; dueAt: number } | null;
  update: number | null;
  shift: { start: number; end: number } | null;
}

/** Taskbar progress (0–1), by priority: a running timer, then an update download, then the
 *  shift under way. null = off. */
export function taskbarProgress(
  p: ProgressSource,
  now = Date.now(),
): { value: number; kind: 'timer' | 'update' | 'shift' } | null {
  const frac = (a: number, b: number): number =>
    Math.min(1, Math.max(0, (now - a) / Math.max(1, b - a)));
  if (p.timer && p.timer.dueAt > now)
    return { value: frac(p.timer.createdAt, p.timer.dueAt), kind: 'timer' };
  if (p.update !== null && p.update >= 0 && p.update < 100)
    return { value: p.update / 100, kind: 'update' };
  if (p.shift && p.shift.start <= now && now < p.shift.end)
    return { value: frac(p.shift.start, p.shift.end), kind: 'shift' };
  return null;
}

/** A PC problem worth a red badge, in a few words (or null). */
export function pcWarning(s: {
  cpuTemp: number | null;
  gpuTemp: number | null;
  disks: Array<{ mount: string; size: number; used: number }>;
}): string | null {
  if (s.cpuTemp !== null && s.cpuTemp >= 90) return `CPU ${Math.round(s.cpuTemp)}°C`;
  if (s.gpuTemp !== null && s.gpuTemp >= 88) return `GPU ${Math.round(s.gpuTemp)}°C`;
  const full = fullestDisk(s.disks);
  if (full && full.pct >= 95) return `${full.mount} ${full.pct}% full`;
  return null;
}

export function fullestDisk(
  disks: Array<{ mount: string; size: number; used: number }>,
): { mount: string; pct: number; free: number } | null {
  const d = disks
    .filter((x) => x.size > 0)
    .map((x) => ({
      mount: x.mount,
      pct: Math.round((x.used / x.size) * 100),
      free: x.size - x.used,
    }))
    .sort((a, b) => b.pct - a.pct)[0];
  return d ?? null;
}

/** "in 2 h 5 min", "in 12 min", "now". */
export function countdown(ms: number): string {
  if (ms <= 60_000) return 'now';
  const m = Math.round(ms / 60_000);
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `in ${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
  return `in ${Math.round(h / 24)} days`;
}

/** A live timer's remaining time: "4:32" or "1:02:10". */
export function clockLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const RAIN = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOW = new Set([71, 73, 75, 77, 85, 86]);
/** The next few hours in a few words: "rain from 17:00", "snow at 09:00", "dry for now". */
export function nextHours(hourly: HourForecast[], now = new Date(), hours = 8): string {
  const h0 = now.getHours();
  const soon = hourly.filter((h) => {
    const t = new Date(h.time).getTime();
    return t >= now.getTime() - 3_600_000 && t <= now.getTime() + hours * 3_600_000;
  });
  const wet = soon.find((h) => RAIN.has(h.code) || SNOW.has(h.code) || (h.rainChance ?? 0) >= 60);
  if (!wet) return 'dry for now';
  const what = SNOW.has(wet.code) ? 'snow' : 'rain';
  return wet.hour === h0 ? `${what} now` : `${what} from ${String(wet.hour).padStart(2, '0')}:00`;
}

/** The tray tooltip: short (Windows cuts it at 127 characters). */
export function trayTooltip(
  name: string,
  parts: { shift?: string; payday?: string; cpu?: number | null },
): string {
  const bits = [
    parts.shift ? `Next shift ${parts.shift}` : '',
    parts.payday ?? '',
    typeof parts.cpu === 'number' ? `CPU ${Math.round(parts.cpu)}%` : '',
  ].filter(Boolean);
  const t = bits.length ? `${name} · ${bits.join(' · ')}` : name;
  return t.length > 127 ? `${t.slice(0, 126)}…` : t;
}

/** "Payday in 3 days" / "Payday tomorrow" / "Payday today". */
export function paydayIn(date: string, now = new Date()): string {
  const d = new Date(`${date}T00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const n = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  return n <= 0 ? 'Payday today' : n === 1 ? 'Payday tomorrow' : `Payday in ${n} days`;
}

/* ── What the widget and strip show (built in main, pushed on change) ── */
export interface PhoneStatus {
  battery: number | null;
  charging: boolean;
  unread: number;
  /** "Send messages by themselves" is on (else the PC asks before sending a reply). */
  autoSend?: boolean;
  payday: { date: string; net: number } | null;
  at: number;
}

export interface DeskSnapshot {
  /** The widget's own settings and the theme, so its window follows changes at once. */
  look: { desk: DeskSettings; theme: string };
  assistant: string;
  name: string;
  music: {
    title: string;
    artist: string;
    app: string;
    playing: boolean;
    position: number | null;
    duration: number | null;
    /** When position was read (ms), to move the bar on between updates. */
    at: number;
    art: string | null;
  } | null;
  shift: { title: string; start: number; end: number } | null;
  payday: { date: string; net: number } | null;
  weather: {
    temp: number;
    unit: string;
    code: number;
    isDay: boolean;
    label: string;
    next: string;
  } | null;
  timers: Array<{ id: string; label: string; dueAt: number; createdAt: number; ringing: boolean }>;
  reminders: Array<{ what: string; at: number }>;
  list: { name: string; items: string[] } | null;
  phone: PhoneStatus | null;
  agentWaiting: boolean;
  warning: string | null;
}
