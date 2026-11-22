import { Menu, Tray, nativeImage, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import type { MainContext } from './context';
import { prettyAccelerator } from './hotkey';
import type { DeskAction } from '@shared/ipc';

export const resourcePath = (file: string): string => join(__dirname, '../../resources', file);

/** System-tray icon: click toggles the window; menu has Show/Hide, compact, mute, settings, quit. */
export class ArcTray {
  private tray: Tray | null = null;
  /** Live tooltip ("Next shift … · Payday in 3 days · CPU 12%"), or null for the plain one. */
  private live: string | null = null;
  /** Desktop & taskbar actions (set once the desk service is running). */
  deskAct: ((a: DeskAction) => void) | null = null;

  constructor(private readonly ctx: MainContext) {}

  create(): void {
    try {
      this.tray = new Tray(nativeImage.createFromPath(resourcePath('tray.png')));
    } catch {
      this.tray = null; // no system tray available (some Linux desktops)
      return;
    }
    // Left-click talks (as the desktop widget does); the menu has everything else.
    this.tray.on('click', () => (this.deskAct ? this.deskAct('talk') : this.ctx.toggleWindow()));
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
      this.live ??
        `${s.assistantName}${hotkey ? ` · ${prettyAccelerator(hotkey)} to show/hide` : ''}`,
    );
    const act = (a: DeskAction) => () => this.deskAct?.(a);
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: visible ? `Hide ${s.assistantName}` : `Show ${s.assistantName}`,
          click: () => this.ctx.toggleWindow(),
        },
        { label: 'Talk', click: act('talk') },
        { label: 'New chat', click: act('new-chat') },
        { label: 'Agent Mode…', click: act('agent') },
        { type: 'separator' },
        { label: 'Lock PC', click: act('lock') },
        { label: 'Sleep', click: act('sleep') },
        {
          label: 'Desktop widget',
          type: 'checkbox',
          checked: s.desktopWidget,
          click: act('widget'),
        },
        { label: 'Phone settings…', click: act('phone') },
        { type: 'separator' },
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

  /** Set the live tooltip (null = back to the plain one). */
  setLive(text: string | null): void {
    this.live = text;
    if (this.tray && !this.tray.isDestroyed())
      this.tray.setToolTip(text ?? this.ctx.settings.get().assistantName);
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
