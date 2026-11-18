import { app, screen, type BrowserWindow, type Rectangle } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_SIZE = { width: 1280, height: 800 };
export const MIN_SIZE = { width: 960, height: 600 };

interface SavedState {
  bounds: Rectangle;
  maximized: boolean;
}

const file = (): string => join(app.getPath('userData'), 'window-state.json');

function isVisibleOnSomeDisplay(b: Rectangle): boolean {
  return screen.getAllDisplays().some(({ workArea: w }) => {
    const overlapX = Math.min(b.x + b.width, w.x + w.width) - Math.max(b.x, w.x);
    const overlapY = Math.min(b.y + b.height, w.y + w.height) - Math.max(b.y, w.y);
    return overlapX >= 100 && overlapY >= 50;
  });
}

/** Returns saved bounds if they are still on a connected display; otherwise null (centre). */
export function loadWindowState(): SavedState | null {
  try {
    if (!existsSync(file())) return null;
    const parsed = JSON.parse(readFileSync(file(), 'utf8')) as Partial<SavedState>;
    const b = parsed.bounds;
    if (!b || [b.x, b.y, b.width, b.height].some((n) => typeof n !== 'number')) return null;
    if (!isVisibleOnSomeDisplay(b)) return null;
    return {
      bounds: {
        ...b,
        width: Math.max(b.width, MIN_SIZE.width),
        height: Math.max(b.height, MIN_SIZE.height),
      },
      maximized: Boolean(parsed.maximized),
    };
  } catch {
    return null;
  }
}

/** Persist bounds (debounced) whenever the window moves or resizes. */
export function trackWindowState(win: BrowserWindow, shouldSave: () => boolean = () => true): void {
  let timer: NodeJS.Timeout | undefined;
  const save = (): void => {
    if (win.isDestroyed() || win.isMinimized() || !shouldSave()) return;
    const state: SavedState = { bounds: win.getNormalBounds(), maximized: win.isMaximized() };
    try {
      writeFileSync(file(), JSON.stringify(state));
    } catch {
      /* non-fatal: next launch simply centres */
    }
  };
  const schedule = (): void => {
    clearTimeout(timer);
    timer = setTimeout(save, 400);
  };
  win.on('resize', schedule);
  win.on('move', schedule);
  win.on('maximize', schedule);
  win.on('unmaximize', schedule);
  win.on('close', () => {
    clearTimeout(timer);
    save();
  });
}
