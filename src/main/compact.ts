import { screen, type BrowserWindow, type Rectangle } from 'electron';
import { MIN_SIZE } from './window-state';

export const COMPACT_SIZE = { width: 420, height: 120 };

/** Compact mode: the main window collapses into a Spotlight-style pill near the top of
 *  the current display, pinned always-on-top. Exiting restores the previous bounds. */
export class CompactController {
  private saved: { bounds: Rectangle; maximized: boolean } | null = null;

  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    private readonly alwaysOnTop: () => boolean,
    private readonly onChange: () => void,
  ) {}

  get isCompact(): boolean {
    return this.saved !== null;
  }

  set(on: boolean): void {
    const win = this.getWindow();
    if (!win || on === this.isCompact) return;

    if (on) {
      const maximized = win.isMaximized();
      if (maximized) win.unmaximize();
      this.saved = { bounds: win.getNormalBounds(), maximized };
      const area = screen.getDisplayMatching(win.getBounds()).workArea;
      win.setMinimumSize(COMPACT_SIZE.width, COMPACT_SIZE.height);
      win.setBounds({
        x: Math.round(area.x + (area.width - COMPACT_SIZE.width) / 2),
        y: Math.round(area.y + area.height * 0.15),
        ...COMPACT_SIZE,
      });
      win.setResizable(false);
      win.setMaximizable(false);
      win.setAlwaysOnTop(true, 'floating');
    } else {
      const s = this.saved;
      this.saved = null;
      win.setResizable(true);
      win.setMaximizable(true);
      win.setAlwaysOnTop(this.alwaysOnTop());
      win.setMinimumSize(MIN_SIZE.width, MIN_SIZE.height);
      if (s) {
        win.setBounds(s.bounds);
        if (s.maximized) win.maximize();
      }
    }
    this.onChange();
  }
}
