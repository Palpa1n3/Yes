import { desk, deskArg } from './desk';
import { deskHooks } from './desk-state';
import { notifyUser, setupHolo } from './holo';
import { ShiftStore } from './services/shift-store';
import {
  app,
  BrowserWindow,
  globalShortcut,
  nativeImage,
  shell,
  clipboard,
  desktopCapturer,
  powerMonitor,
} from 'electron';
import os from 'node:os';
import { join } from 'node:path';
import si from 'systeminformation';
import { IPC } from '@shared/ipc';
import type { AppCommand, Settings, TimerInfo } from '@shared/types';
import { CompactController } from './compact';
import type { MainContext } from './context';
import { Hotkey, prettyAccelerator } from './hotkey';
import { registerIpc } from './ipc';
import { AuditLog, ErrorLog } from './services/diagnostics';
import { UsageTracker } from './services/usage-tracker';
import { emit } from './ipc/handle';
import { SettingsStore } from './services/settings-store';
import { TelemetryService } from './services/telemetry';
import { TimerService, describeDuration } from './services/timer-service';
import { WinProcessReader } from './services/win-processes';
import { ArcTray, resourcePath } from './tray';
import { DEFAULT_SIZE, MIN_SIZE, loadWindowState, trackWindowState } from './window-state';

let mainWindow: BrowserWindow | null = null;
let quitting = false;
let rendererReady = false;
let hintedTray = false;
let timersLoaded = false;
const pending: AppCommand[] = [];

const settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'));
/** Started by "launch at login": stay in the tray until summoned. */
const startHidden = process.argv.includes('--hidden');
const getWindow = (): BrowserWindow | null =>
  mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
const isShown = (w: BrowserWindow): boolean => w.isVisible() && !w.isMinimized();

// Many services tidy up on will-quit.
app.setMaxListeners(40);
/** Recent notifications for the phone companion (newest first). */
const notices: Array<{ at: number; text: string }> = [];
const errors = new ErrorLog(join(app.getPath('userData'), 'logs', 'arc.log'));
errors.capture();

const ctx: MainContext = {
  getWindow,
  settings,
  errors,
  recentNotices: () => notices,
  notify: (text) => {
    notices.unshift({ at: Date.now(), text: text.slice(0, 300) });
    notices.length = Math.min(notices.length, 20);
  },
  shifts: new ShiftStore(join(app.getPath('userData'), 'shifts.json')),
  usage: new UsageTracker({
    file: join(app.getPath('userData'), 'usage.json'),
    budget: () => settings.get().monthlyBudget,
    warn: (text) => {
      ctx.notify(text);
      ctx.command({ type: 'notice', text });
    },
  }),
  audit: new AuditLog(join(app.getPath('userData'), 'logs', 'actions.jsonl')),
  telemetry: new TelemetryService(
    si,
    (s) => emit(getWindow(), IPC.system.onStats, s),
    // Windows: Get-Process is far faster than the WMI query systeminformation uses.
    process.platform === 'win32' ? new WinProcessReader().read : undefined,
  ),
  compact: new CompactController(
    getWindow,
    () => settings.get().alwaysOnTop,
    () => {
      ctx.pushWindowState();
      tray.refresh();
    },
  ),
  hotkey: new Hotkey(() => ctx.toggleWindow()),
  voiceHotkey: new Hotkey(() => {
    ctx.peekWindow();
    ctx.command({ type: 'voice-toggle' });
  }, ['CommandOrControl+Alt+V']),
  openMicHotkey: new Hotkey(() => {
    ctx.peekWindow();
    ctx.command({ type: 'open-mic-toggle' });
  }, ['CommandOrControl+Shift+M']),
  clipboardHotkey: new Hotkey(() => {
    void Promise.resolve(clipboard.readText()).then((t) => {
      ctx.showWindow(true);
      ctx.command({ type: 'clipboard-actions', text: String(t ?? '').slice(0, 20_000) });
    });
  }, ['CommandOrControl+Alt+Shift+C']),
  timers: new TimerService({
    file: join(app.getPath('userData'), 'timers.json'),
    onChange: (list) => emit(getWindow(), IPC.timers.onChange, list),
    onRing: (t) => ringTimer(t),
  }),
  updateSettings: (patch) => settings.set(patch),
  setCompact: (on) => {
    ctx.showWindow(on);
    ctx.compact.set(on);
  },
  showWindow: (focusInput = false) => {
    const w = getWindow();
    if (!w) return;
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
    if (focusInput) ctx.command({ type: 'focus-input' });
  },
  peekWindow: () => {
    const w = getWindow();
    if (!w || isShown(w)) return;
    const show = (): void => {
      if (w.isDestroyed()) return;
      if (w.isMinimized()) w.restore();
      w.showInactive();
    };
    // Screen awareness: picture the screen first, so ARC isn't covering it.
    if (ctx.captureScreen) void ctx.captureScreen().finally(show);
    else show();
  },
  toggleWindow: () => {
    const w = getWindow();
    if (!w) return;
    if (isShown(w) && w.isFocused()) w.hide();
    else ctx.showWindow(true);
  },
  openSettings: () => {
    if (ctx.compact.isCompact) ctx.compact.set(false);
    ctx.showWindow();
    ctx.command({ type: 'open-settings' });
  },
  command: (c) => {
    if (rendererReady) emit(getWindow(), IPC.app.onCommand, c);
    else pending.push(c);
  },
  pushWindowState: () => {
    const w = getWindow();
    if (w)
      emit(w, IPC.window.onState, { maximized: w.isMaximized(), compact: ctx.compact.isCompact });
  },
  quit: () => {
    quitting = true;
    app.quit();
  },
};

const tray = new ArcTray(ctx);

/** A timer is up: Windows notification (with sound), flash the taskbar, tell the UI
 *  (which plays the alarm and shows Dismiss / Snooze). */
function ringTimer(t: TimerInfo): void {
  const name = settings.get().assistantName;
  // A scheduled Agent Mode task: start it (nobody needs to be there), no alarm.
  if (t.kind === 'agent' && t.task) {
    ctx.timers.cancel(t.id);
    // Came due while Alton was closed or the PC was off: don't run it late by surprise.
    if (Date.now() - t.dueAt > 30 * 60_000) {
      const text = `Missed the scheduled task (it was due at ${new Date(t.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}): “${t.task.slice(0, 120)}”. Say “handle this for me” to run it now.`;
      ctx.notify(text);
      ctx.command({ type: 'notice', text });
      return;
    }
    ctx.audit.add('agent', `Scheduled task started: ${t.task}`);
    const text = `Starting the scheduled task: “${t.task.slice(0, 120)}”. Press Esc or say “stop” to take over.`;
    ctx.notify(text);
    ctx.command({ type: 'notice', text });
    notifyUser(`${name} · Scheduled task`, t.task.slice(0, 200));
    ctx.startAgent?.(t.task);
    return;
  }
  const focus = t.kind === 'focus';
  const body = focus
    ? `Focus session done (${Math.round(t.durationMs / 60_000)} min). Time for a short break.`
    : t.label || `${describeDuration(t.durationMs / 60_000)} timer finished`;
  if (focus) ctx.audit.add('routine', body);
  notifyUser(focus ? `${name} · Focus done` : `${name} · Time's up`, body, focus ? 'info' : 'warn');
  const w = getWindow();
  if (w && !w.isFocused()) w.flashFrame(true);
  emit(w, IPC.timers.onRing, t);
}

function applyHotkey(accel: string): void {
  const { active, fellBack } = ctx.hotkey.register(accel);
  if (fellBack) {
    ctx.command({
      type: 'notice',
      text: active
        ? `${prettyAccelerator(accel)} is in use by another app, so I'm using ${prettyAccelerator(active)} to show and hide.`
        : `I couldn't register a global shortcut; ${prettyAccelerator(accel)} may be taken by another app.`,
    });
  }
  tray.refresh();
}

function applyVoiceHotkey(accel: string): void {
  const { active, fellBack } = ctx.voiceHotkey.register(accel);
  if (fellBack)
    ctx.command({
      type: 'notice',
      text: active
        ? `${prettyAccelerator(accel)} is in use by another app, so ${prettyAccelerator(active)} starts voice input.`
        : `I couldn't register ${prettyAccelerator(accel)} for voice input; another app may be using it.`,
    });
}

function applyOpenMicHotkey(accel: string): void {
  const { active, fellBack } = ctx.openMicHotkey.register(accel);
  if (fellBack)
    ctx.command({
      type: 'notice',
      text: active
        ? `${prettyAccelerator(accel)} is in use by another app, so ${prettyAccelerator(active)} turns the open mic on and off.`
        : `I couldn't register ${prettyAccelerator(accel)} for the open mic; another app may be using it.`,
    });
}

function applyClipboardHotkey(accel: string): void {
  const { active, fellBack } = ctx.clipboardHotkey.register(accel);
  if (fellBack)
    ctx.command({
      type: 'notice',
      text: active
        ? `${prettyAccelerator(accel)} is in use by another app, so ${prettyAccelerator(active)} opens the clipboard actions.`
        : `I couldn't register ${prettyAccelerator(accel)} for clipboard actions; another app may be using it.`,
    });
}

/** The wake word and open mic need the hidden window to keep processing the mic. */
function applyBackgroundThrottling(): void {
  const s = settings.get();
  getWindow()?.webContents.setBackgroundThrottling(!(s.wakeWord || s.openMicHotkey));
}

function applyLoginItem(on: boolean): void {
  // Only meaningful for an installed app; in dev it would register the Electron binary.
  if (!app.isPackaged || process.platform === 'linux') return;
  app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] });
}

/** "jack.jones" / "JackJ" → "Jack". Used once, to pre-fill your name. */
function firstNameFromAccount(): string {
  const raw = os.userInfo().username.split(/[._\s-]/)[0] ?? '';
  const word = raw.match(/^[A-Z]?[a-z]+/)?.[0] ?? raw;
  return word ? (word[0] ?? '').toUpperCase() + word.slice(1).toLowerCase() : '';
}

function onSettingsChanged(next: Settings, prev: Settings): void {
  emit(getWindow(), IPC.settings.onChange, next);
  if (next.globalHotkey !== prev.globalHotkey) applyHotkey(next.globalHotkey);
  if (
    next.desktopWidget !== prev.desktopWidget ||
    JSON.stringify(next.desk) !== JSON.stringify(prev.desk)
  )
    desk()?.applySettings();
  if (next.voiceHotkey !== prev.voiceHotkey) applyVoiceHotkey(next.voiceHotkey);
  if (next.openMicHotkey !== prev.openMicHotkey) applyOpenMicHotkey(next.openMicHotkey);
  if (next.clipboardHotkey !== prev.clipboardHotkey) applyClipboardHotkey(next.clipboardHotkey);
  if (next.wakeWord !== prev.wakeWord || next.openMicHotkey !== prev.openMicHotkey)
    applyBackgroundThrottling();
  if (next.alwaysOnTop !== prev.alwaysOnTop && !ctx.compact.isCompact)
    getWindow()?.setAlwaysOnTop(next.alwaysOnTop);
  if (next.launchAtLogin !== prev.launchAtLogin) applyLoginItem(next.launchAtLogin);
  tray.refresh();
}

function createWindow(): BrowserWindow {
  const saved = loadWindowState();

  const win = new BrowserWindow({
    ...(saved ? saved.bounds : DEFAULT_SIZE),
    center: !saved,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    show: false,
    title: 'ARC',
    icon: nativeImage.createFromPath(resourcePath('icon.png')),
    alwaysOnTop: settings.get().alwaysOnTop,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  if (saved?.maximized) win.maximize();
  win.once('ready-to-show', () => {
    if (!startHidden || !tray.exists || settings.get().openOnWake) win.show();
  });

  // Lock the renderer down: no new windows, no navigation away from the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });

  // Deliver anything queued (hotkey notices etc.) once the UI can receive it.
  win.webContents.on('did-finish-load', () => {
    rendererReady = true;
    for (const c of pending.splice(0)) emit(win, IPC.app.onCommand, c);
    if (!timersLoaded) {
      timersLoaded = true;
      ctx.timers.load(); // rings anything that came due while ARC was closed
    }
  });
  win.webContents.on('did-start-loading', () => {
    rendererReady = false;
  });
  // Problems in the UI go in the same log as main's.
  win.webContents.on('console-message', (e) => {
    const { level, message, sourceId, lineNumber } = e;
    if (level === 'error' || level === 'warning')
      errors.add(
        level === 'error' ? 'error' : 'warn',
        'ui',
        `${message}${sourceId ? ` (${sourceId.split('/').pop()}:${lineNumber})` : ''}`,
      );
  });
  win.webContents.on('render-process-gone', (_e, d) =>
    errors.add('error', 'ui', `The window's renderer stopped: ${d.reason} (code ${d.exitCode})`),
  );

  // Telemetry only runs while the window is actually on screen.
  // ...or while the desktop widget / taskbar strip is showing.
  const syncTelemetry = (): void => {
    if (isShown(win) || desk()?.needsStats()) ctx.telemetry.start();
    else ctx.telemetry.stop();
    tray.refresh();
  };
  deskHooks.syncTelemetry = syncTelemetry;
  // Windows drops the thumbnail toolbar while the window is hidden: put it back.
  win.on('show', () => desk()?.refreshThumbar());
  win.on('show', syncTelemetry);
  win.on('hide', syncTelemetry);
  win.on('minimize', syncTelemetry);
  win.on('restore', syncTelemetry);
  win.on('focus', () => win.flashFrame(false));
  win.on('maximize', () => ctx.pushWindowState());
  win.on('unmaximize', () => ctx.pushWindowState());

  // Close hides to the tray (if there is one); Quit lives in the tray menu.
  win.on('close', (e) => {
    // Linux trays are unreliable (many desktops have none), so closing quits there.
    if (quitting || !settings.get().closeToTray || !tray.exists || process.platform === 'linux')
      return;
    e.preventDefault();
    win.hide();
    if (!hintedTray) {
      hintedTray = true;
      tray.notifyHidden();
    }
  });

  trackWindowState(win, () => !ctx.compact.isCompact);
  // Pulse-to-music: the page asks for the screen with sound; give it the system sound
  // ("loopback", Windows) so the avatar can follow the music. Only loudness is measured.
  win.webContents.session.setDisplayMediaRequestHandler(
    (_req, callback) => {
      void desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) =>
          sources[0] ? callback({ video: sources[0], audio: 'loopback' }) : callback({}),
        )
        .catch(() => callback({}));
    },
    { useSystemPicker: false },
  );

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));

  win.on('closed', () => {
    mainWindow = null;
    ctx.telemetry.stop();
  });
  return win;
}

// Transparent windows on Linux need this to composite correctly.
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-transparent-visuals');
if (process.platform === 'win32') app.setAppUserModelId('com.arc.assistant');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // A second launch (e.g. a jump list task) hands its arguments to this one.
  app.on('second-instance', (_e, argv) => {
    const a = deskArg(argv);
    if (a) desk()?.act(a);
    else ctx.showWindow(true);
  });

  void app.whenReady().then(() => {
    // One long-lived PowerShell for systeminformation on Windows: far cheaper than one per probe.
    if (process.platform === 'win32') si.powerShellStart();
    // First run: units from the Windows region (UK: °C + mph, US: °F + mph).
    const region = app.getLocaleCountryCode().toUpperCase();
    settings.load({
      userName: firstNameFromAccount(),
      tempUnit: ['US', 'LR', 'MM'].includes(region) ? 'f' : 'c',
      windUnit: ['US', 'GB', 'LR', 'MM'].includes(region) ? 'mph' : 'kmh',
    });
    settings.subscribe(onSettingsChanged);
    // "Open Alton when the PC starts or wakes": pop up after sleep, and after signing back in.
    const onWake = (): void => {
      if (settings.get().openOnWake) setTimeout(() => ctx.showWindow(), 1500);
    };
    powerMonitor.on('resume', onWake);
    powerMonitor.on('unlock-screen', onWake);
    registerIpc(ctx);
    mainWindow = createWindow();
    tray.create();
    const d = desk();
    if (d) {
      d.bindTray((t) => tray.setLive(t));
      tray.deskAct = (a) => d.act(a);
      d.applySettings();
      // Started from the jump list ("--desk=talk")?
      const a = deskArg(process.argv);
      if (a) setTimeout(() => d.act(a), 1500);
    }
    setupHolo({
      enabled: () => settings.get().holoNotifications,
      onClick: () => ctx.showWindow(),
      display: () => settings.get().desk.display,
    });
    applyHotkey(settings.get().globalHotkey);
    applyVoiceHotkey(settings.get().voiceHotkey);
    applyOpenMicHotkey(settings.get().openMicHotkey);
    applyClipboardHotkey(settings.get().clipboardHotkey);
    applyBackgroundThrottling();
    // Emergency stop from anywhere: Agent Mode, routines, speech and listening.
    globalShortcut.register('CommandOrControl+Alt+Backspace', () => {
      ctx.stopAgent?.();
      ctx.command({ type: 'emergency-stop' });
    });

    app.on('activate', () => {
      if (!getWindow()) mainWindow = createWindow();
      else ctx.showWindow();
    });
  });

  app.on('before-quit', () => {
    quitting = true;
  });
  app.on('will-quit', () => {
    settings.saveNow();
    ctx.hotkey.unregister();
    ctx.voiceHotkey.unregister();
    ctx.openMicHotkey.unregister();
    ctx.clipboardHotkey.unregister();
    ctx.telemetry.stop();
    ctx.timers.dispose();
    tray.destroy();
    if (process.platform === 'win32') si.powerShellRelease();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
