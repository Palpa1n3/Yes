import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { on: vi.fn(), isPackaged: true },
  nativeImage: { createFromBitmap: vi.fn(() => ({})) },
  BrowserWindow: { fromWebContents: vi.fn() },
  ipcMain: { handle: vi.fn(), on: vi.fn(), removeAllListeners: vi.fn() },
  screen: { on: vi.fn() },
}));

describe('taskbar icons', () => {
  it('draws shapes with smooth edges', async () => {
    const { SHAPES, rasterise } = await import('../../src/main/desk-icons');
    const dot = rasterise(SHAPES.dot, 16);
    expect(dot[8 * 16 + 8]).toBe(1); // middle filled
    expect(dot[0]).toBe(0); // corner empty
    expect([...dot].some((v) => v > 0 && v < 1)).toBe(true); // soft edge
    const pause = rasterise(SHAPES.pause, 16);
    expect(pause[8 * 16 + 8]).toBe(0); // the gap between the bars
    expect(pause[8 * 16 + 5]).toBe(1);
  });
});

describe('jump list arguments', () => {
  it('reads --desk=… and ignores anything else', async () => {
    const { deskArg } = await import('../../src/main/desk');
    expect(deskArg(['ARC.exe', '--desk=talk'])).toBe('talk');
    expect(deskArg(['ARC.exe', '--desk=format-c'])).toBeNull();
    expect(deskArg(['ARC.exe', '--hidden'])).toBeNull();
  });
});
