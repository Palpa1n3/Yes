import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DESK,
  cleanDesk,
  cleanHits,
  overHit,
  clockLeft,
  cornerPosition,
  countdown,
  fullestDisk,
  nearestCorner,
  nextHours,
  overlayFor,
  paydayIn,
  pcWarning,
  stripBounds,
  taskbarProgress,
  tilesForSize,
  trayTooltip,
} from '@shared/desk';

describe('desk settings', () => {
  it('cleans stored values, keeps tile order and adds new tiles', () => {
    const d = cleanDesk({
      style: 'hud',
      opacity: 5,
      tiles: [
        { id: 'weather', on: false },
        { id: 'nope', on: true },
        { id: 'alton', on: true },
      ],
      strip: { on: true, place: 'up', items: ['cpu', 'cpu', 'bad'] },
    });
    expect(d.style).toBe('hud');
    expect(d.opacity).toBe(30);
    expect(d.tiles.slice(0, 2)).toEqual([
      { id: 'weather', on: false },
      { id: 'alton', on: true },
    ]);
    expect(d.tiles).toHaveLength(DEFAULT_DESK.tiles.length);
    expect(d.strip).toEqual({ on: true, place: 'right', display: null, items: ['cpu'] });
  });
  it('shows the clock only when small, two tiles at medium, all at large', () => {
    const tiles = cleanDesk({ tiles: [{ id: 'music', on: false }] }).tiles;
    expect(tilesForSize({ tiles, size: 'small' })).toEqual([]);
    expect(tilesForSize({ tiles, size: 'medium' })).toEqual(['alton', 'work']);
    expect(tilesForSize({ tiles, size: 'large' })).not.toContain('music');
  });
});

describe('placing windows', () => {
  const area = { x: 1920, y: 0, width: 1920, height: 1040 };
  it('puts the widget in a corner of a screen and snaps to the nearest one', () => {
    expect(cornerPosition('top-right', area, { width: 300, height: 400 })).toEqual({
      x: 3528,
      y: 12,
    });
    expect(cornerPosition('bottom-left', area, { width: 300, height: 400 })).toEqual({
      x: 1932,
      y: 628,
    });
    expect(nearestCorner({ x: 3400, y: 700, width: 300, height: 300 }, area)).toBe('bottom-right');
    expect(nearestCorner({ x: 1950, y: 20, width: 300, height: 300 }, area)).toBe('top-left');
  });
  it('docks the strip just above a bottom taskbar', () => {
    const display = { x: 0, y: 0, width: 1920, height: 1080 };
    const work = { x: 0, y: 0, width: 1920, height: 1032 };
    expect(stripBounds(display, work, 'right', { width: 420, height: 34 })).toEqual({
      x: 1492,
      y: 994,
      width: 420,
      height: 34,
    });
    expect(stripBounds(display, work, 'centre', { width: 420, height: 34 }).x).toBe(750);
  });
});

describe('taskbar', () => {
  it('picks the badge: approval, listening, thinking, then a PC warning', () => {
    expect(overlayFor({ assistant: 'listening', agentWaiting: true, warning: 'x' })).toBe(
      'approval',
    );
    expect(overlayFor({ assistant: 'listening', agentWaiting: false, warning: 'x' })).toBe(
      'listening',
    );
    expect(overlayFor({ assistant: 'executing', agentWaiting: false, warning: null })).toBe(
      'thinking',
    );
    expect(overlayFor({ assistant: 'idle', agentWaiting: false, warning: 'CPU 95°C' })).toBe(
      'warning',
    );
    expect(overlayFor({ assistant: 'idle', agentWaiting: false, warning: null })).toBeNull();
  });
  it('shows a timer first, then an update, then the shift under way', () => {
    const now = 10_000;
    const shift = { start: 0, end: 20_000 };
    expect(
      taskbarProgress({ timer: { createdAt: 0, dueAt: 40_000 }, update: 50, shift }, now),
    ).toEqual({
      value: 0.25,
      kind: 'timer',
    });
    expect(taskbarProgress({ timer: null, update: 40, shift }, now)).toEqual({
      value: 0.4,
      kind: 'update',
    });
    expect(taskbarProgress({ timer: null, update: null, shift }, now)).toEqual({
      value: 0.5,
      kind: 'shift',
    });
    expect(taskbarProgress({ timer: null, update: 100, shift: null }, now)).toBeNull();
  });
  it('warns about heat and full disks', () => {
    const disks = [
      { mount: 'C:', size: 100, used: 50 },
      { mount: 'D:', size: 100, used: 97 },
    ];
    expect(fullestDisk(disks)).toEqual({ mount: 'D:', pct: 97, free: 3 });
    expect(pcWarning({ cpuTemp: 93, gpuTemp: null, disks })).toBe('CPU 93°C');
    expect(pcWarning({ cpuTemp: 60, gpuTemp: 70, disks })).toBe('D: 97% full');
    expect(pcWarning({ cpuTemp: 60, gpuTemp: 70, disks: disks.slice(0, 1) })).toBeNull();
  });
  it('writes a short tray tooltip', () => {
    expect(
      trayTooltip('Alton', { shift: 'Tue 07:00', payday: 'Payday in 3 days', cpu: 12.4 }),
    ).toBe('Alton · Next shift Tue 07:00 · Payday in 3 days · CPU 12%');
    expect(trayTooltip('Alton', {})).toBe('Alton');
    expect(trayTooltip('A', { shift: 'x'.repeat(200) }).length).toBe(127);
  });
});

describe('words and times', () => {
  it('counts down and reads the next hours of weather', () => {
    expect(countdown(30_000)).toBe('now');
    expect(countdown(12 * 60_000)).toBe('in 12 min');
    expect(countdown(125 * 60_000)).toBe('in 2 h 5 min');
    expect(clockLeft(272_000)).toBe('4:32');
    expect(clockLeft(3_730_000)).toBe('1:02:10');
    const now = new Date(2026, 10, 24, 14, 10);
    const h = (hour: number, code: number, rainChance = 0) => ({
      time: `2026-11-24T${String(hour).padStart(2, '0')}:00`,
      hour,
      temp: 8,
      code,
      rainChance,
    });
    expect(nextHours([h(14, 3), h(15, 3), h(17, 61)], now)).toBe('rain from 17:00');
    expect(nextHours([h(14, 3)], now)).toBe('dry for now');
    expect(paydayIn('2026-11-27', now)).toBe('Payday in 3 days');
    expect(paydayIn('2026-11-25', now)).toBe('Payday tomorrow');
  });
});

describe('widget clicks without a mouse hook', () => {
  const win = { x: 2000, y: 40, width: 300, height: 400 };
  const hits = [{ x: 10, y: 10, width: 280, height: 100 }];
  it('takes clicks only over a tile', () => {
    expect(overHit({ x: 2050, y: 80 }, win, hits)).toBe(true);
    expect(overHit({ x: 2050, y: 300 }, win, hits)).toBe(false);
    expect(overHit({ x: 100, y: 80 }, win, hits)).toBe(false);
    expect(overHit({ x: 2050, y: 80 }, win, [])).toBe(false);
  });
  it('ignores bad rectangles from the page', () => {
    expect(
      cleanHits([
        { x: 1, y: 2, width: 3, height: 4 },
        { x: 'a' },
        { x: 1, y: 1, width: 0, height: 5 },
        null,
      ]),
    ).toEqual([{ x: 1, y: 2, width: 3, height: 4 }]);
    expect(cleanHits('nope')).toEqual([]);
  });
});
