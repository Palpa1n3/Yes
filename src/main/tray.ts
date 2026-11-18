import { Menu, Tray, nativeImage, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import type { MainContext } from './context';
import { prettyAccelerator } from './hotkey';

export const resourcePath = (file: string): string => join(__dirname, '../../resources', file);

/** System-tray icon: click toggles the window; menu has Show/Hide, compact, mute, settings, quit. */
export class ArcTray {
  private tray: Tray | null = null;

  constructor(private readonly ctx: MainContext) {}

  create(): void {
    try {
      this.tray = new Tray(nativeImage.createFromPath(resourcePath('tray.png')));
    } catch {
      this.tray = null; // no system tray available (some Linux desktops)
      return;
    }
    this.tray.on('click', () => this.ctx.toggleWindow());
    this.refresh();
  }

  get exists(): boolean {
    return this.tray !== null && !this.tray.isDestroyed();
  }

  /** Rebuild the menu so labels and checkboxes reflect the current state. */
  refresh(): void {
    if (!this.tray || this.tray.isDestroyed()) return;
    const win: BrowserWindow | null = this.ctx.getWindow();
    const visible = !!win && win.isVisible() && !win.isMinimized();
    const s = this.ctx.settings.get();
    const hotkey = this.ctx.hotkey.active;
    this.tray.setToolTip(
      `${s.assistantName}${hotkey ? ` · ${prettyAccelerator(hotkey)} to show/hide` : ''}`,
    );
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: visible ? `Hide ${s.assistantName}` : `Show ${s.assistantName}`,
          click: () => this.ctx.toggleWindow(),
        },
        {
          label: 'Compact mode',
          type: 'checkbox',
          checked: this.ctx.compact.isCompact,
          click: (i) => this.ctx.setCompact(i.checked),
        },
        {
          label: 'Mute voice',
          type: 'checkbox',
          checked: s.voiceMuted,
          click: (i) => this.ctx.updateSettings({ voiceMuted: i.checked }),
        },
        { type: 'separator' },
        { label: 'Settings…', click: () => this.ctx.openSettings() },
        { type: 'separator' },
        { label: `Quit ${s.assistantName}`, click: () => this.ctx.quit() },
      ]),
    );
  }

  /** One-time hint when closing hides to the tray (Windows balloon). */
  notifyHidden(): void {
    if (!this.tray || process.platform !== 'win32') return;
    const hotkey = this.ctx.hotkey.active;
    this.tray.displayBalloon({
      iconType: 'info',
      title: `${this.ctx.settings.get().assistantName} is still running`,
      content: `Click the tray icon${hotkey ? ` or press ${prettyAccelerator(hotkey)}` : ''} to bring it back. Quit from the tray menu.`,
    });
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }
}
