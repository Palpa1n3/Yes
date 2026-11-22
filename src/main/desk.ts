/** The desktop widget, the taskbar strip and the taskbar features (thumbnail toolbar, jump
 *  list, overlay badge, progress bar, live tray tooltip), all from one snapshot of what's going
 *  on. Built every 2 s from in-memory state (cheap); pushed to the windows only on a change. */
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { BrowserWindow, app, ipcMain, screen, type Rectangle } from 'electron';
import {
  cornerPosition,
  nearestCorner,
  overlayFor,
  paydayIn,
  pcWarning,
  stripBounds,
  taskbarProgress,
  trayTooltip,
  nextHours,
  type DeskSettings,
  type DeskSnapshot,
} from '@shared/desk';
import { IPC, type DeskAction } from '@shared/ipc';
import type { NowPlaying } from '@shared/media';
import type { NotesState } from '@shared/notes';
import { upcomingShifts, currentShift, type Shift } from '@shared/shifts';
import { describeWeather, tempSymbol, type WeatherData } from '@shared/weather';
import type { MainContext } from './context';
import { BADGE_COLOURS, SHAPES, makeIcon } from './desk-icons';
import { deskState } from './desk-state';
import { lastPayday, phoneStatus } from './services/phone-status';

export interface DeskDeps {
  ctx: MainContext;
  media(): NowPlaying | null;
  notes(): NotesState;
  weather(): WeatherData | null;
  gaming(): boolean;
  fullscreen(): boolean;
  mediaKey(key: 'play_pause' | 'next' | 'previous'): void;
  /** Start or stop telemetry as needed (the widget needs CPU even with Alton hidden). */
  syncTelemetry(): void;
}

const WIDGET_WIDTH = 320;
const STRIP = { width: 480, height: 36 };

let api: DeskService | null = null;
/** The running desk service (set once IPC is registered). */
export const desk = (): DeskService | null => api;

export class DeskService {
  private widget: BrowserWindow | null = null;
  private strip: BrowserWindow | null = null;
  private widgetHeight = 160;
  private lastKey = '';
  private snap: DeskSnapshot;
  private overlayKey = '';
  private progressKey = '';
  private thumbKey = '';
  private trayKey = '';
  private hidden = false;
  private setTray: ((text: string | null) => void) | null = null;

  constructor(private readonly d: DeskDeps) {
    this.snap = this.build();
    ipcMain.handle(IPC.desk.get, () => this.snap);
    ipcMain.removeAllListeners(IPC.desk.action);
    ipcMain.on(IPC.desk.action, (_e, a: DeskAction) => this.act(a));
    ipcMain.removeAllListeners(IPC.desk.hover);
    ipcMain.on(IPC.desk.hover, (e, on: boolean) => {
      const w = BrowserWindow.fromWebContents(e.sender);
      if (w && (w === this.widget || w === this.strip))
        w.setIgnoreMouseEvents(!on, { forward: true });
    });
    ipcMain.removeAllListeners(IPC.desk.resize);
    ipcMain.on(IPC.desk.resize, (e, h: number) => {
      const w = BrowserWindow.fromWebContents(e.sender);
      if (w !== this.widget || !Number.isFinite(h)) return;
      this.widgetHeight = Math.max(80, Math.min(1400, Math.round(h)));
      this.placeWidget();
    });
    ipcMain.removeAllListeners(IPC.app.reportState);
    ipcMain.on(IPC.app.reportState, (_e, s: string) => {
      if (typeof s === 'string') deskState.assistant = s.slice(0, 20);
      this.tick();
    });
    const t = setInterval(() => this.tick(), 2000);
    t.unref?.();
    screen.on('display-metrics-changed', () => this.placeAll());
    screen.on('display-added', () => this.placeAll());
    screen.on('display-removed', () => this.placeAll());
  }

  private get s(): DeskSettings {
    return this.d.ctx.settings.get().desk;
  }

  /** The tray asks for its live tooltip through this. */
  bindTray(set: (text: string | null) => void): void {
    this.setTray = set;
  }

  needsStats(): boolean {
    return !!(this.widget || this.strip) && !this.hidden;
  }

  /* ── The snapshot ── */
  private build(): DeskSnapshot {
    const now = Date.now();
    const ctx = this.d.ctx;
    const m = this.d.media();
    const shifts: Shift[] = ctx.shifts.upcoming();
    const cur = currentShift(shifts);
    const next = cur ?? upcomingShifts(shifts)[0] ?? null;
    const w = this.d.weather();
    const timers = ctx.timers.list();
    const notes = this.d.notes();
    const list =
      notes.lists.find((l) => /shop/i.test(l.name) && l.items.some((i) => !i.done)) ??
      notes.lists.find((l) => l.items.some((i) => !i.done)) ??
      null;
    const stats = ctx.telemetry.snapshot();
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const settings = ctx.settings.get();
    return {
      look: { desk: settings.desk, theme: settings.theme },
      assistant: deskState.assistant,
      name: ctx.settings.get().assistantName,
      music: m
        ? {
            title: m.title,
            artist: m.artist,
            app: m.app,
            playing: m.playing,
            position: m.position ?? null,
            duration: m.duration ?? null,
            at: m.at ?? now,
            art: m.art || null,
          }
        : null,
      shift: next
        ? {
            title: next.title,
            start: new Date(next.start).getTime(),
            end: new Date(next.end).getTime(),
          }
        : null,
      payday: phoneStatus()?.payday ?? lastPayday(),
      weather: w
        ? {
            temp: Math.round(w.current.temp),
            unit: tempSymbol(w.units.temp),
            code: w.current.code,
            isDay: w.current.isDay,
            label: describeWeather(w.current.code).label,
            next: nextHours(w.hourly),
          }
        : null,
      timers: timers
        .filter((t) => t.dueAt - now < 6 * 3_600_000 || t.status === 'ringing')
        .slice(0, 4)
        .map((t) => ({
          id: t.id,
          label: t.label,
          dueAt: t.dueAt,
          createdAt: t.createdAt,
          ringing: t.status === 'ringing',
        })),
      reminders: timers
        .filter((t) => t.label && t.dueAt > now + 6 * 3_600_000 && t.dueAt <= endOfDay.getTime())
        .slice(0, 3)
        .map((t) => ({ what: t.label, at: t.dueAt })),
      list: list
        ? {
            name: list.name,
            items: list.items
              .filter((i) => !i.done)
              .map((i) => i.text)
              .slice(0, 6),
          }
        : null,
      phone: phoneStatus(),
      agentWaiting: deskState.agentWaiting || (ctx.pendingApprovals?.().length ?? 0) > 0,
      warning: stats.timestamp
        ? pcWarning({
            cpuTemp: stats.cpu.temp,
            gpuTemp: stats.gpu?.temp ?? null,
            disks: stats.disks,
          })
        : null,
    };
  }

  private tick(): void {
    this.snap = this.build();
    // Art is big: compare by song instead.
    const key = JSON.stringify({
      ...this.snap,
      music: this.snap.music ? { ...this.snap.music, art: !!this.snap.music.art, at: 0 } : null,
    });
    if (key !== this.lastKey) {
      this.lastKey = key;
      for (const w of [this.widget, this.strip])
        if (w && !w.isDestroyed()) w.webContents.send(IPC.desk.onSnapshot, this.snap);
    }
    this.autoHide();
    this.taskbar();
  }

  /* ── Buttons (widget, strip, jump list, tray, thumbnail toolbar) ── */
  act(a: DeskAction): void {
    const ctx = this.d.ctx;
    switch (a) {
      case 'talk':
        ctx.command({ type: 'voice-toggle' });
        return;
      case 'new-chat':
        ctx.showWindow();
        ctx.command({ type: 'new-chat' });
        return;
      case 'agent':
        ctx.showWindow(true);
        ctx.command({ type: 'agent-start' });
        return;
      case 'lock':
        if (process.platform === 'win32')
          execFile('rundll32.exe', ['user32.dll,LockWorkStation'], () => undefined);
        return;
      case 'sleep':
        void ctx.power?.schedule('sleep', 0, 'from the taskbar');
        return;
      case 'widget':
        ctx.updateSettings({ desktopWidget: !ctx.settings.get().desktopWidget });
        return;
      case 'phone':
        ctx.showWindow();
        ctx.command({ type: 'open-settings' });
        return;
      case 'play_pause':
      case 'next':
      case 'previous':
        this.d.mediaKey(a);
        return;
    }
  }

  /* ── Windows ── */
  private loadPage(w: BrowserWindow, hash: string): void {
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (!app.isPackaged && devUrl) void w.loadURL(`${devUrl}#${hash}`);
    else void w.loadFile(join(__dirname, '../renderer/index.html'), { hash });
  }

  private makeWindow(bounds: Rectangle, top: boolean): BrowserWindow {
    const w = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      resizable: false,
      movable: !this.s.locked,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: top,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    // Clicks pass through until the mouse is over a tile (the page says so via desk.hover).
    w.setIgnoreMouseEvents(true, { forward: true });
    return w;
  }

  private display(id: number | null): Electron.Display {
    return screen.getAllDisplays().find((x) => x.id === id) ?? screen.getPrimaryDisplay();
  }

  applyWidget(on: boolean): void {
    if (!on) {
      if (this.widget && !this.widget.isDestroyed()) this.widget.destroy();
      this.widget = null;
      this.d.syncTelemetry();
      return;
    }
    if (this.widget && !this.widget.isDestroyed()) return this.placeWidget();
    const w = this.makeWindow(
      { x: 0, y: 0, width: WIDGET_WIDTH, height: this.widgetHeight },
      false,
    );
    this.widget = w;
    this.placeWidget();
    this.loadPage(w, 'widget');
    w.once('ready-to-show', () => {
      if (!this.hidden) w.showInactive();
      this.d.syncTelemetry();
    });
    // Dragged (when not locked): snap to the nearest corner of the screen it was dropped on.
    w.on('moved', () => {
      if (this.s.locked) return;
      const b = w.getBounds();
      const disp = screen.getDisplayMatching(b);
      const corner = nearestCorner(b, disp.workArea);
      if (corner !== this.s.corner || disp.id !== this.s.display)
        this.d.ctx.updateSettings({ desk: { ...this.s, corner, display: disp.id } });
      else this.placeWidget();
    });
    w.on('closed', () => {
      if (this.widget === w) this.widget = null;
    });
  }

  private placeWidget(): void {
    const w = this.widget;
    if (!w || w.isDestroyed()) return;
    const area = this.display(this.s.display).workArea;
    const height = Math.min(this.widgetHeight, area.height - 24);
    const p = cornerPosition(this.s.corner, area, { width: WIDGET_WIDTH, height });
    w.setBounds({ x: p.x, y: p.y, width: WIDGET_WIDTH, height });
    w.setMovable(!this.s.locked);
    w.setOpacity(this.s.opacity / 100);
  }

  applyStrip(): void {
    const on = this.s.strip.on;
    if (!on) {
      if (this.strip && !this.strip.isDestroyed()) this.strip.destroy();
      this.strip = null;
      this.d.syncTelemetry();
      return;
    }
    if (this.strip && !this.strip.isDestroyed()) return this.placeStrip();
    const w = this.makeWindow({ x: 0, y: 0, ...STRIP }, true);
    w.setMovable(false);
    this.strip = w;
    this.placeStrip();
    this.loadPage(w, 'strip');
    w.once('ready-to-show', () => {
      if (!this.hidden) w.showInactive();
      this.d.syncTelemetry();
    });
    w.on('closed', () => {
      if (this.strip === w) this.strip = null;
    });
  }

  private placeStrip(): void {
    const w = this.strip;
    if (!w || w.isDestroyed()) return;
    const disp = this.display(this.s.strip.display);
    w.setBounds(stripBounds(disp.bounds, disp.workArea, this.s.strip.place, STRIP));
    w.setOpacity(this.s.opacity / 100);
  }

  private placeAll(): void {
    this.placeWidget();
    this.placeStrip();
  }

  /** Settings changed: windows, placement and taskbar features. */
  applySettings(): void {
    this.applyWidget(this.d.ctx.settings.get().desktopWidget);
    this.applyStrip();
    this.placeAll();
    this.applyJumpList();
    this.thumbKey = '';
    this.overlayKey = '';
    this.progressKey = '';
    this.trayKey = '';
    this.tick();
  }

  /** Out of the way in gaming mode or when something is full-screen. */
  private autoHide(): void {
    const hide = this.s.autoHide && (this.d.gaming() || this.d.fullscreen());
    if (hide === this.hidden) return;
    this.hidden = hide;
    for (const w of [this.widget, this.strip]) {
      if (!w || w.isDestroyed()) continue;
      if (hide) w.hide();
      else w.showInactive();
    }
    this.d.syncTelemetry();
  }

  /* ── Taskbar ── */
  private taskbar(): void {
    const win = this.d.ctx.getWindow();
    const s = this.s;
    if (win && !win.isDestroyed() && process.platform === 'win32') {
      // Overlay badge
      const o = s.overlay
        ? overlayFor({
            assistant: this.snap.assistant,
            agentWaiting: this.snap.agentWaiting,
            warning: this.snap.warning,
          })
        : null;
      if (o !== this.overlayKey) {
        this.overlayKey = o ?? '';
        const label =
          o === 'approval'
            ? 'Agent Mode needs your OK'
            : o === 'listening'
              ? 'Listening'
              : o === 'thinking'
                ? 'Thinking'
                : o === 'warning'
                  ? `PC warning: ${this.snap.warning}`
                  : '';
        win.setOverlayIcon(o ? makeIcon(SHAPES.dot, [...BADGE_COLOURS[o]], 16, true) : null, label);
      }
      // Progress bar
      const now = Date.now();
      const timer = this.snap.timers.find((t) => !t.ringing && t.dueAt > now) ?? null;
      const p = s.progress
        ? taskbarProgress({
            timer,
            update: deskState.update,
            shift:
              this.snap.shift && this.snap.shift.start <= now
                ? { start: this.snap.shift.start, end: this.snap.shift.end }
                : null,
          })
        : null;
      const pk = p ? `${p.kind}:${Math.round(p.value * 200)}` : 'off';
      if (pk !== this.progressKey) {
        this.progressKey = pk;
        win.setProgressBar(p ? p.value : -1);
      }
      // Thumbnail toolbar (re-set when play state changes)
      const tk = s.thumbar
        ? `on:${this.snap.music?.playing ? 1 : 0}:${win.isVisible() ? 1 : 0}`
        : 'off';
      if (tk !== this.thumbKey && win.isVisible()) {
        this.thumbKey = tk;
        this.setThumbar(win);
      }
    }
    // Live tray tooltip (every tick is fine: the tray only changes when the text does)
    if (this.setTray) {
      const t = s.trayLive ? this.tooltip() : null;
      if (t !== this.trayKey) {
        this.trayKey = t ?? '';
        this.setTray(t);
      }
    }
  }

  private setThumbar(win: BrowserWindow): void {
    if (!this.s.thumbar) {
      win.setThumbarButtons([]);
      return;
    }
    const ice: [number, number, number] = [220, 235, 245];
    const playing = !!this.snap.music?.playing;
    win.setThumbarButtons([
      { tooltip: 'Talk to Alton', icon: makeIcon(SHAPES.mic, ice), click: () => this.act('talk') },
      {
        tooltip: 'Previous',
        icon: makeIcon(SHAPES.previous, ice),
        click: () => this.act('previous'),
      },
      {
        tooltip: playing ? 'Pause' : 'Play',
        icon: makeIcon(playing ? SHAPES.pause : SHAPES.play, ice),
        click: () => this.act('play_pause'),
      },
      { tooltip: 'Next', icon: makeIcon(SHAPES.next, ice), click: () => this.act('next') },
      { tooltip: 'New chat', icon: makeIcon(SHAPES.plus, ice), click: () => this.act('new-chat') },
    ]);
  }

  /** Re-apply the toolbar after the window is shown again (Windows drops it when hidden). */
  refreshThumbar(): void {
    this.thumbKey = '';
    this.tick();
  }

  private tooltip(): string {
    const sh = this.snap.shift;
    const shift = sh
      ? new Date(sh.start).toLocaleString('en-GB', {
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : undefined;
    const pd = this.snap.payday ? paydayIn(this.snap.payday.date) : undefined;
    const stats = this.d.ctx.telemetry.snapshot();
    return trayTooltip(this.snap.name, {
      ...(shift ? { shift } : {}),
      ...(pd ? { payday: pd } : {}),
      cpu: stats.timestamp ? stats.cpu.load : null,
    });
  }

  applyJumpList(): void {
    if (process.platform !== 'win32') return;
    if (!this.s.jumpList) {
      app.setUserTasks([]);
      return;
    }
    const args = (a: string): string =>
      app.isPackaged ? `--desk=${a}` : `"${app.getAppPath()}" --desk=${a}`;
    const task = (a: DeskAction, title: string, description: string): Electron.Task => ({
      program: process.execPath,
      arguments: args(a),
      iconPath: process.execPath,
      iconIndex: 0,
      title,
      description,
    });
    app.setUserTasks([
      task('talk', 'Talk', 'Start listening'),
      task('new-chat', 'New chat', 'Open a new chat'),
      task('agent', 'Agent Mode', 'Ask Alton to do something on the PC'),
      task('lock', 'Lock PC', 'Lock the PC now'),
      task('sleep', 'Sleep', 'Put the PC to sleep'),
      task('widget', 'Desktop widget on/off', 'Show or hide the desktop widget'),
      task('phone', 'Phone settings', 'Open the phone companion settings'),
    ]);
  }
}

/** Start the desk service (once, when IPC is registered). */
export function startDesk(deps: DeskDeps): DeskService {
  api = new DeskService(deps);
  return api;
}

/** "--desk=talk" from the command line (jump list) → the action, if any. */
export function deskArg(argv: readonly string[]): DeskAction | null {
  const a = argv.find((x) => x.startsWith('--desk='))?.slice(7);
  const ok: DeskAction[] = ['talk', 'new-chat', 'agent', 'lock', 'sleep', 'widget', 'phone'];
  return ok.includes(a as DeskAction) ? (a as DeskAction) : null;
}
