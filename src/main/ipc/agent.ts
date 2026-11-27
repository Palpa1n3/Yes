import { deskState } from '../desk-state';
import { app, BrowserWindow, desktopCapturer, globalShortcut, safeStorage, screen } from 'electron';
import { join } from 'node:path';
import { fmtUsd, taskCapReached } from '@shared/usage';
import { sessionGuard } from '../services/session-guard';
import Anthropic from '@anthropic-ai/sdk';
import { IPC } from '@shared/ipc';
import { agentBusy, shotSize, type AgentQuestion, type AgentStatus } from '@shared/agent';
import type { MainContext } from '../context';
import {
  AgentRunner,
  type AgentScreen,
  type Shot,
  type AgentOptions,
} from '../services/agent-runner';
import { WinInput } from '../services/agent-input-win';
import { SecretStore } from '../services/secret-store';
import { emit, handle, on } from './handle';

/** The always-on-top "AGENT MODE" banner. Click-through, and left out of screenshots. */
const OVERLAY_HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
html,body{margin:0;background:transparent;overflow:hidden;font-family:Segoe UI,system-ui,sans-serif}
.bar{margin:6px auto 0;display:flex;align-items:center;gap:10px;width:max-content;max-width:94vw;padding:7px 14px;
background:rgba(8,14,22,.92);border:1px solid rgba(255,70,70,.85);box-shadow:0 0 18px rgba(255,60,60,.45);color:#e8f6ff;font-size:13px;border-radius:3px}
.dot{width:9px;height:9px;border-radius:50%;background:#ff4646;box-shadow:0 0 8px #ff4646;animation:p 1s infinite}
@keyframes p{50%{opacity:.35}}
b{letter-spacing:.14em;color:#ff7070;font-size:12px}
#t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60vw;color:#bfe9ff}
.k{border:1px solid rgba(191,233,255,.5);padding:0 5px;border-radius:2px;font-size:11px;color:#bfe9ff}
</style></head><body><div class="bar"><span class="dot"></span><b>AGENT MODE</b><span id="t">Starting…</span><span class="k">Esc</span><span style="font-size:11px;opacity:.75">to stop</span></div>
<script>window.setText=function(s){document.getElementById('t').textContent=s}</script></body></html>`;

/** Agent Mode picture-in-picture: what Alton sees and each step, bottom-right. */
const PIP_HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
html,body{margin:0;background:transparent;overflow:hidden;font-family:Segoe UI,system-ui,sans-serif;color:#d8f2ff}
.box{margin:6px;border:1px solid rgba(80,200,255,.75);background:rgba(6,12,20,.93);box-shadow:0 0 22px rgba(60,190,255,.35);border-radius:6px;overflow:hidden}
.hd{display:flex;align-items:center;gap:8px;padding:5px 9px;font-size:11px;letter-spacing:.14em;color:#7fd6ff;border-bottom:1px solid rgba(80,200,255,.25)}
.dot{width:7px;height:7px;border-radius:50%;background:#ff4646;box-shadow:0 0 6px #ff4646;animation:p 1s infinite}@keyframes p{50%{opacity:.3}}
img{display:block;width:100%;height:auto;min-height:60px;background:#03070c}
ol{margin:0;padding:6px 10px 8px 26px;font-size:12px;max-height:96px;overflow:hidden}
li{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.55}li:last-child{opacity:1;color:#fff}
</style></head><body><div class="box"><div class="hd"><span class="dot"></span>WHAT ALTON SEES</div><img id="i" alt=""><ol id="s"></ol></div>
<script>window.setShot=function(u){document.getElementById('i').src=u};
window.addStep=function(t){var o=document.getElementById('s');var l=o.lastElementChild;if(l&&l.textContent===t)return;var e=document.createElement('li');e.textContent=t;o.appendChild(e);while(o.children.length>5)o.removeChild(o.firstChild)}</script></body></html>`;

export function registerAgentIpc(
  ctx: MainContext,
  extra: { lessons(): string[]; learn(lesson: string): void },
): AgentRunner {
  const win = process.platform === 'win32';
  const secrets = new SecretStore(join(app.getPath('userData'), 'anthropic-key.bin'), safeStorage);
  const input = new WinInput();
  let overlay: BrowserWindow | null = null;
  let pip: BrowserWindow | null = null;
  let hidMain = false;
  let lastState: AgentStatus['state'] = 'idle';
  let lastLogged = 0;
  let lastQuestion = '';
  const pending = new Map<string, (answer: string | boolean | null) => void>();

  /** The screen being worked on: the one the mouse was on when the task started. */
  let target: Electron.Display | null = null;
  const primary = (): Electron.Display => target ?? screen.getPrimaryDisplay();
  const pickScreen = (): void => {
    target = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  };
  const queue: Array<{ t: string; opts: AgentOptions }> = [];
  const physical = (): { width: number; height: number } => {
    const d = primary();
    return {
      width: Math.round(d.size.width * d.scaleFactor),
      height: Math.round(d.size.height * d.scaleFactor),
    };
  };

  const capture = async (size: { width: number; height: number }) => {
    const d = primary();
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
    const src = sources.find((s) => s.display_id === String(d.id)) ?? sources[0];
    if (!src || src.thumbnail.isEmpty()) throw new Error('Could not take a screenshot.');
    return src.thumbnail;
  };

  const shotOf = (img: Electron.NativeImage): Shot => {
    const s = img.getSize();
    return { base64: img.toJPEG(75).toString('base64'), width: s.width, height: s.height };
  };

  const agentScreen: AgentScreen = {
    // Desktop (physical) position of that screen's corner: 0,0 on the main monitor.
    origin: () => {
      const d = primary();
      if (process.platform !== 'win32') return { x: 0, y: 0 };
      const p = screen.dipToScreenPoint({ x: d.bounds.x, y: d.bounds.y });
      return { x: Math.round(p.x), y: Math.round(p.y) };
    },
    size: physical,
    shot: async () => {
      const img = await capture(shotSize(physical()));
      pipShot(img);
      return shotOf(img);
    },
    zoom: async ([x0, y0, x1, y1]) => {
      const full = physical();
      const small = shotSize(full);
      const k = full.width / small.width;
      const img = await capture(full);
      const real = img.getSize();
      const f = real.width / full.width; // in case the capture came back smaller
      const left = Math.max(0, Math.round(Math.min(x0, x1) * k * f));
      const top = Math.max(0, Math.round(Math.min(y0, y1) * k * f));
      const width = Math.min(real.width - left, Math.max(8, Math.round(Math.abs(x1 - x0) * k * f)));
      const height = Math.min(
        real.height - top,
        Math.max(8, Math.round(Math.abs(y1 - y0) * k * f)),
      );
      const crop = img.crop({ x: left, y: top, width, height });
      const fit = Math.min(1, 1280 / width, 800 / height);
      return shotOf(
        fit < 1
          ? crop.resize({ width: Math.round(width * fit), height: Math.round(height * fit) })
          : crop,
      );
    },
  };

  const pipShot = (img: Electron.NativeImage): void => {
    if (!pip || pip.isDestroyed()) return;
    const url = `data:image/jpeg;base64,${img.resize({ width: 340 }).toJPEG(60).toString('base64')}`;
    void pip.webContents
      .executeJavaScript(`window.setShot(${JSON.stringify(url)})`)
      .catch(() => undefined);
  };
  const pipStep = (text: string): void => {
    if (!pip || pip.isDestroyed()) return;
    void pip.webContents
      .executeJavaScript(`window.addStep(${JSON.stringify(text.slice(0, 120))})`)
      .catch(() => undefined);
  };
  const showPip = (): void => {
    if (!ctx.settings.get().agentPip || (pip && !pip.isDestroyed())) return;
    const d = primary();
    pip = new BrowserWindow({
      width: 352,
      height: 330,
      x: Math.round(d.workArea.x + d.workArea.width - 360),
      y: Math.round(d.workArea.y + d.workArea.height - 338),
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, javascript: true },
    });
    pip.setAlwaysOnTop(true, 'screen-saver');
    pip.setIgnoreMouseEvents(true);
    // Never part of Alton's own screenshots.
    pip.setContentProtection(true);
    void pip.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PIP_HTML)}`);
    pip.once('ready-to-show', () => pip?.showInactive());
  };

  const showOverlay = (): void => {
    showPip();
    if (overlay && !overlay.isDestroyed()) return;
    const d = primary();
    overlay = new BrowserWindow({
      width: 720,
      height: 52,
      x: Math.round(d.workArea.x + (d.workArea.width - 720) / 2),
      y: d.workArea.y,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, javascript: true },
    });
    overlay.setAlwaysOnTop(true, 'screen-saver');
    overlay.setIgnoreMouseEvents(true);
    // Keep the banner out of Alton's own screenshots (Windows 10 2004+).
    overlay.setContentProtection(true);
    void overlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(OVERLAY_HTML)}`);
    overlay.once('ready-to-show', () => overlay?.showInactive());
  };

  const overlayText = (text: string): void => {
    if (!overlay || overlay.isDestroyed()) return;
    void overlay.webContents
      .executeJavaScript(`window.setText(${JSON.stringify(text.slice(0, 140))})`)
      .catch(() => undefined);
  };

  const closeOverlay = (): void => {
    if (pip && !pip.isDestroyed()) pip.close();
    pip = null;
    if (overlay && !overlay.isDestroyed()) overlay.destroy();
    overlay = null;
  };

  const hideMain = (): void => {
    const w = ctx.getWindow();
    if (w && w.isVisible() && !w.isMinimized()) {
      w.hide();
      hidMain = true;
    }
  };

  const restoreMain = (): void => {
    if (hidMain) ctx.showWindow(false);
    hidMain = false;
  };

  const ESC = 'Escape';
  const escOn = (): void => {
    if (!globalShortcut.isRegistered(ESC)) globalShortcut.register(ESC, () => runner.stop());
  };
  const escOff = (): void => {
    if (globalShortcut.isRegistered(ESC)) globalShortcut.unregister(ESC);
  };

  const waitFor = (q: AgentQuestion): Promise<string | boolean | null> => {
    // The user needs ARC on screen to answer.
    escOff();
    ctx.showWindow(false);
    hidMain = true;
    overlayText(q.kind === 'confirm' ? 'Waiting for your OK…' : 'Waiting for your answer…');
    return new Promise<string | boolean | null>((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(q.id);
        resolve(null);
      }, 10 * 60_000);
      pending.set(q.id, (a) => {
        clearTimeout(timer);
        pending.delete(q.id);
        resolve(a);
      });
    }).then(async (a) => {
      if (agentBusy(runner.get())) {
        hideMain();
        escOn();
        await new Promise((r) => setTimeout(r, 400));
      }
      return a;
    });
  };

  // What the current task has cost so far, for its spending cap.
  let taskSpend = 0;
  let capHit = false;
  const runner = new AgentRunner({
    client: async () => {
      const key = await secrets.get();
      return key ? new Anthropic({ apiKey: key, maxRetries: 2 }) : null;
    },
    model: () => ctx.settings.get().agentModel,
    onUsage: (model, usage) => {
      taskSpend += ctx.usage.record(model, usage, 'agent');
      // One task may only spend so much (Settings › AI › Spending).
      const cap = ctx.settings.get().agentTaskLimit;
      if (!capHit && taskCapReached(taskSpend, cap)) {
        capHit = true;
        const msg = `Agent Mode stopped: this task reached its spending cap (${fmtUsd(cap)}). Raise it in Settings › AI › Spending if it needs more.`;
        ctx.notify(msg);
        ctx.command({ type: 'notice', text: msg });
        ctx.audit.add('agent', msg, false);
        runner.stop();
      }
    },
    lessons: () => extra.lessons(),
    learn: (l) => extra.learn(l),
    names: () => {
      const s = ctx.settings.get();
      return { assistant: s.assistantName, user: s.userName };
    },
    screen: agentScreen,
    input,
    confirm: async (q) => (await waitFor(q)) === true,
    ask: async (q) => {
      const a = await waitFor(q);
      return typeof a === 'string' ? a : null;
    },
    onStatus: (s: AgentStatus) => {
      deskState.agentWaiting = !!s.question;
      // Remember the task in progress, to name it if the PC goes off mid-task.
      try {
        if (s.state === 'running' || s.state === 'paused')
          sessionGuard().setAgent({ task: s.task, step: s.step });
        else if (s.state === 'done' || s.state === 'error' || s.state === 'stopped')
          sessionGuard().setAgent(null);
      } catch {
        /* not fatal */
      }
      const prev = lastState;
      lastState = s.state;
      if (s.question && s.question.id !== lastQuestion) {
        lastQuestion = s.question.id;
        ctx.notify(`Agent Mode needs you: ${s.question.text}`);
      }
      if ((s.state === 'done' || s.state === 'error') && prev !== s.state)
        ctx.notify(`Agent Mode ${s.state === 'done' ? 'finished' : 'stopped'}: ${s.result}`);
      // Every agent step goes in the action history.
      const fresh = s.log.filter((l) => l.at > lastLogged);
      for (const l of fresh)
        ctx.audit.add('agent', l.text, !/^(Problem|Stopped|Denied)/.test(l.text));
      if (fresh.length) lastLogged = Math.max(...fresh.map((l) => l.at));
      emit(ctx.getWindow(), IPC.agent.onChange, s);
      if (s.state === 'running') {
        overlayText(`Step ${s.step}/${s.maxSteps} · ${s.last}`);
        pipStep(s.last);
      }
      // Paused: hand the PC back (Esc free, Alton visible with a Resume button).
      if (s.state === 'paused' && prev !== 'paused') {
        escOff();
        overlayText('Paused · click Resume or say "carry on"');
        ctx.showWindow(false);
        hidMain = true;
      } else if (prev === 'paused' && s.state === 'running') {
        hideMain();
        escOn();
      }
    },
    // Esc is the stop key, so step aside while Alton presses it itself.
    escape: (pressing) => (pressing ? escOff() : agentBusy(runner.get()) && escOn()),
  });

  const start = (task: string, opts: AgentOptions = {}): AgentStatus => {
    const t = task.trim().slice(0, 2000);
    if (!t) return runner.get();
    // Busy: queue it (up to 3) and run it next.
    if (agentBusy(runner.get())) {
      if (queue.length < 3) {
        queue.push({ t, opts });
        ctx.command({
          type: 'notice',
          text: `Agent Mode is busy; “${t.slice(0, 60)}” is queued (${queue.length} waiting).`,
        });
      }
      return runner.get();
    }
    if (!win) {
      emit(ctx.getWindow(), IPC.agent.onChange, {
        ...runner.get(),
        state: 'error',
        task: t,
        result: 'Agent Mode needs Windows.',
      });
      return runner.get();
    }
    const paused = ctx.usage.blocked('agent');
    if (paused) {
      emit(ctx.getWindow(), IPC.agent.onChange, {
        ...runner.get(),
        state: 'error',
        task: t,
        result: paused,
      });
      return runner.get();
    }
    if (!ctx.settings.get().agentMode) {
      emit(ctx.getWindow(), IPC.agent.onChange, {
        ...runner.get(),
        state: 'error',
        task: t,
        result: 'Agent Mode is switched off in Settings › Smart features.',
      });
      return runner.get();
    }
    pickScreen();
    hideMain();
    showOverlay();
    escOn();
    void (async () => {
      // Give the window a moment to get out of the way before the first screenshot.
      await new Promise((r) => setTimeout(r, 500));
      taskSpend = 0;
      capHit = false;
      await runner.run(t, opts);
      escOff();
      closeOverlay();
      for (const resolve of pending.values()) resolve(null);
      restoreMain();
      // Next queued task, unless the user stopped this one.
      const next = runner.get().state === 'stopped' ? undefined : queue.shift();
      if (runner.get().state === 'stopped') queue.length = 0;
      if (next) setTimeout(() => start(next.t, next.opts), 1500);
    })();
    return runner.get();
  };

  handle(IPC.agent.status, () => runner.get());
  handle(IPC.agent.start, (task) => start(String(task)));
  on(
    IPC.agent.stop,
    () => {
      runner.stop();
      for (const resolve of pending.values()) resolve(null);
    },
    ctx.getWindow,
  );
  on(IPC.agent.pause, (_w, v) => runner.pause(v === true), ctx.getWindow);
  on(
    IPC.agent.answer,
    (_w, id, answer) =>
      pending.get(String(id))?.(
        typeof answer === 'boolean' ? answer : String(answer).slice(0, 2000),
      ),
    ctx.getWindow,
  );
  ctx.startAgent = start;
  ctx.agentAnswer = (id, answer) =>
    pending.get(id)?.(typeof answer === 'boolean' ? answer : answer.slice(0, 2000));
  ctx.pauseAgent = (on) => runner.pause(on);
  ctx.stopAgent = () => {
    runner.stop();
    for (const resolve of pending.values()) resolve(null);
  };
  app.on('will-quit', () => {
    runner.stop();
    escOff();
    input.close();
  });
  return runner;
}
