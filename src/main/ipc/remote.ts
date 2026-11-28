import { app, BrowserWindow, desktopCapturer, ipcMain, screen, session } from 'electron';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { serveUrlFor } from '@shared/remote-link';
import { join } from 'node:path';
import { IPC, type RemoteInfo } from '@shared/ipc';
import type { AgentStatus } from '@shared/agent';
import type { GamingStatus } from '@shared/gaming';
import type { NowPlaying } from '@shared/media';
import type { MainContext } from '../context';
import { REMOTE_PORT, RemoteServer, isPrivateAddress } from '../services/remote-server';
import { handle, on } from './handle';
import { ps } from '../services/system-actions';
import { makePhoneRoutes } from './remote-api';
import { grab } from './screen';
import { WinInput } from '../services/agent-input-win';
import { notifyUser } from '../holo';
import { parseCombo } from '@shared/agent';
import { toPhysical, type RemoteInput } from '@shared/remote-input';
import { applyProjectUpdate, isAltonProject } from '../services/project-update';
import { basename } from 'node:path';
import type { ChatStore } from '../services/chat-store';
import type { NotesStore } from '../services/notes-store';
import type { Routine } from '@shared/routines';
import type { CanonicalCommand, CommandResult } from '@shared/commands';

/** MAC addresses of the adapters with a home-network address (for Wake-on-LAN apps). */
export const macs = (): string[] => [
  ...new Set(
    Object.values(networkInterfaces())
      .flat()
      .filter(
        (n) =>
          n &&
          n.family === 'IPv4' &&
          !n.internal &&
          isPrivateAddress(n.address) &&
          n.mac !== '00:00:00:00:00:00',
      )
      .map((n) => (n?.mac ?? '').toUpperCase()),
  ),
];

const lanUrls = (): string[] =>
  Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal && isPrivateAddress(n.address))
    .map((n) => `http://${n?.address}:${REMOTE_PORT}`);

export function registerRemoteIpc(
  ctx: MainContext,
  src: {
    agent(): AgentStatus;
    gaming(): GamingStatus;
    nowPlaying(): NowPlaying | null;
    notices(): Array<{ at: number; text: string }>;
    phone: {
      chats: ChatStore;
      notes: NotesStore;
      routines(): Routine[];
      execute(cmd: CanonicalCommand): Promise<CommandResult>;
    };
    history(): Array<{ who: 'you' | 'alton'; text: string }>;
    /** The PC's "right now" picture, shared with the phone. */
    now?(): string;
    /** The chat open on the PC. */
    activeChat?(): { id: string; title: string; updatedAt: number } | null;
  },
): void {
  const replies = new Map<string, (text: string) => void>();
  let seq = 0;
  let error: string | null = null;

  // ── Remote control from the phone ──
  let liveDisplay: Electron.Display | null = null;
  // A hidden window streams the chosen screen continuously, so each frame the phone asks for
  // is ready at once (much faster than taking a fresh screenshot per frame).
  let cap: BrowserWindow | null = null;
  let capFor: number | null = null;
  let latest: Buffer | null = null;
  /** Counts frames from the stream, and the newest one already sent to the phone. */
  let frameSeq = 0;
  let servedSeq = 0;
  let lastAsked = 0;
  /** When the stream last failed to start: use plain screenshots for a while instead. */
  let streamFailedAt = 0;
  const capSession = session.fromPartition('arc-remote-capture');
  let capSource: Electron.DesktopCapturerSource | null = null;
  capSession.setDisplayMediaRequestHandler((_req, cb) =>
    capSource ? cb({ video: capSource }) : cb({}),
  );
  ipcMain.on('arc:remote-frame', (e, data: unknown) => {
    if (!cap || e.sender !== cap.webContents || !(data instanceof Uint8Array)) return;
    latest = Buffer.from(data);
    frameSeq++;
  });
  const stopCapture = (): void => {
    cap?.destroy();
    cap = null;
    capFor = null;
    latest = null;
    servedSeq = frameSeq;
  };
  // Stop streaming once the phone has stopped looking for a while.
  setInterval(() => {
    if (cap && Date.now() - lastAsked > 20_000) stopCapture();
  }, 5000);
  const ensureCapture = async (d: Electron.Display): Promise<void> => {
    lastAsked = Date.now();
    if (cap && capFor === d.id) return;
    stopCapture();
    if (Date.now() - streamFailedAt < 60_000) return;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 },
    });
    capSource = sources.find((s) => s.display_id === String(d.id)) ?? sources[0] ?? null;
    if (!capSource) return;
    const k = Math.min(1, 1280 / Math.max(d.size.width, d.size.height));
    const w = Math.round(d.size.width * k);
    const h = Math.round(d.size.height * k);
    capFor = d.id;
    cap = new BrowserWindow({
      show: false,
      width: 320,
      height: 200,
      webPreferences: {
        partition: 'arc-remote-capture',
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false,
      },
    });
    const html = `<script>
const { ipcRenderer } = require('electron');
(async () => {
  const s = await navigator.mediaDevices.getDisplayMedia({ video: { width: ${w}, height: ${h}, frameRate: 30 }, audio: false });
  const v = document.createElement('video');
  v.muted = true;
  v.srcObject = s;
  await v.play();
  const c = document.createElement('canvas');
  c.width = ${w};
  c.height = ${h};
  const g = c.getContext('2d');
  // Encode each new video frame as it arrives (Windows only sends frames when the screen
  // changes), one at a time, at up to 30 a second.
  let busy = false;
  const grab = () => {
    if (busy) return;
    busy = true;
    g.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob((b) => {
      if (b) b.arrayBuffer().then((a) => ipcRenderer.send('arc:remote-frame', new Uint8Array(a)));
      busy = false;
    }, 'image/jpeg', 0.55);
  };
  if (v.requestVideoFrameCallback) {
    const onFrame = () => { grab(); v.requestVideoFrameCallback(onFrame); };
    v.requestVideoFrameCallback(onFrame);
    // A still screen sends no frames: refresh now and then so the picture never goes stale.
    setInterval(grab, 1000);
  } else setInterval(grab, 33);
})().catch(() => window.close());
</script>`;
    const mine = cap;
    mine.on('closed', () => {
      if (cap === mine) {
        if (!latest) streamFailedAt = Date.now();
        cap = null;
        capFor = null;
      }
    });
    void cap.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  };
  let input: WinInput | null = null;
  let lastNotice = 0;
  const noticeControl = (
    what: 'viewing' | 'controlling' | 'updating the Alton project on',
  ): void => {
    if (Date.now() - lastNotice < 5 * 60_000) return;
    lastNotice = Date.now();
    ctx.audit.add('action', `Your phone is ${what} this PC`);
    notifyUser(
      'Phone remote control',
      `Your phone is ${what} this PC. Turn it off in Settings › Privacy if this isn't you.`,
      'warn',
    );
  };
  const remoteInput = async (cmd: RemoteInput): Promise<void> => {
    if (process.platform !== 'win32') throw new Error('Remote control needs Windows');
    noticeControl('controlling');
    input ??= new WinInput();
    const io = input;
    const d = liveDisplay ?? screen.getPrimaryDisplay();
    const at = (x: number, y: number): { x: number; y: number } => toPhysical(x, y, d);
    const click = async (which: 'left' | 'right'): Promise<void> => {
      await io.button(which, true);
      await io.button(which, false);
    };
    switch (cmd.type) {
      case 'move': {
        const p = at(cmd.x, cmd.y);
        await io.move(p.x, p.y);
        return;
      }
      case 'click':
      case 'right':
      case 'double': {
        const p = at(cmd.x, cmd.y);
        await io.move(p.x, p.y);
        await click(cmd.type === 'right' ? 'right' : 'left');
        if (cmd.type === 'double') await click('left');
        return;
      }
      case 'scroll': {
        const p = at(cmd.x, cmd.y);
        await io.move(p.x, p.y);
        await io.wheel(cmd.dy, 0);
        return;
      }
      case 'drag': {
        const a = at(cmd.x, cmd.y);
        const b = at(cmd.x2, cmd.y2);
        await io.move(a.x, a.y);
        await io.button('left', true);
        for (let i = 1; i <= 10; i++)
          await io.move(a.x + ((b.x - a.x) * i) / 10, a.y + ((b.y - a.y) * i) / 10);
        await io.button('left', false);
        return;
      }
      case 'key': {
        const codes = parseCombo(cmd.keys);
        if (!codes) throw new Error(`Unknown key ${cmd.keys}`);
        for (const vk of codes) await io.key(vk, true);
        for (const vk of [...codes].reverse()) await io.key(vk, false);
        return;
      }
      case 'type':
        await io.type(cmd.text);
        return;
    }
  };
  const phone = makePhoneRoutes(ctx, {
    ...src.phone,
    screenshot: async () => (await grab().catch(() => null))?.jpeg ?? null,
    live: async (screenId) => {
      noticeControl('viewing');
      const all = screen.getAllDisplays();
      const d =
        all.find((x) => x.id === screenId) ??
        (liveDisplay && all.find((x) => x.id === liveDisplay?.id)) ??
        screen.getPrimaryDisplay();
      liveDisplay = d;
      await ensureCapture(d);
      // Wait briefly for the first frame of a new stream.
      for (let i = 0; i < 30 && cap && (!latest || capFor !== d.id); i++)
        await new Promise((r) => setTimeout(r, 100));
      // Hand each phone request a frame it hasn't had yet (up to half a second's wait), so the
      // phone's requests in flight bring different frames instead of repeats.
      for (let i = 0; i < 50 && cap && capFor === d.id && frameSeq <= servedSeq; i++)
        await new Promise((r) => setTimeout(r, 10));
      if (capFor === d.id && latest) {
        servedSeq = frameSeq;
        return latest;
      }
      // No stream (yet): a plain screenshot instead (slower, but always works).
      const k = Math.min(1, 1100 / Math.max(d.size.width, d.size.height));
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.round(d.size.width * k),
          height: Math.round(d.size.height * k),
        },
      });
      const src = sources.find((x) => x.display_id === String(d.id)) ?? sources[0];
      return src && !src.thumbnail.isEmpty() ? src.thumbnail.toJPEG(55) : null;
    },
    screens: () => {
      const primary = screen.getPrimaryDisplay().id;
      return screen.getAllDisplays().map((d, i) => ({
        id: d.id,
        label: `Screen ${i + 1}${d.id === primary ? ' (main)' : ''}`,
        current: d.id === (liveDisplay?.id ?? primary),
      }));
    },
    input: (cmd) => remoteInput(cmd),
    projectStatus: () => {
      const dir = ctx.settings.get().projectDir;
      return { ready: isAltonProject(dir), dir };
    },
    projectUpdate: async (file, message) => {
      if (process.platform !== 'win32') return { ok: false, log: 'Updating needs Windows.' };
      noticeControl('updating the Alton project on');
      const zip = join(app.getPath('downloads'), 'From phone', basename(file));
      const r = await applyProjectUpdate(zip, ctx.settings.get().projectDir, message);
      notifyUser(
        'Alton project update',
        r.ok
          ? 'Updated from your phone and pushed to GitHub.'
          : 'An update from your phone didn’t finish: see the phone for why.',
        r.ok ? 'info' : 'warn',
      );
      return r;
    },
    macs,
    sleep: () =>
      void ps(
        "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false) | Out-Null",
        20_000,
      ),
  });
  on(
    IPC.remote.progress,
    (_w, id, p) =>
      p &&
      typeof p === 'object' &&
      phone.progress(String(id), {
        text: String(p.text ?? ''),
        activity: String(p.activity ?? ''),
        done: p.done === true,
        ...(p.error ? { error: String(p.error) } : {}),
        ...(Array.isArray(p.sources) ? { sources: p.sources } : {}),
      }),
    ctx.getWindow,
  );
  const server = new RemoteServer({
    route: phone.route,
    version: () => app.getVersion(),
    pingOrigin: () => {
      try {
        return new URL(ctx.settings.get().phoneAppUrl).origin;
      } catch {
        return '';
      }
    },
    file: join(app.getPath('userData'), 'paired-phones.json'),
    status: () => {
      const s = ctx.telemetry.snapshot();
      const a = src.agent();
      const g = src.gaming();
      const n = src.nowPlaying();
      return {
        name: ctx.settings.get().assistantName,
        pc: {
          cpu: s.timestamp ? s.cpu.load : null,
          memPct: s.memory.total ? (s.memory.used / s.memory.total) * 100 : null,
          cpuTemp: s.cpu.temp ?? null,
          uptimeHours: s.uptime ? Math.round(s.uptime / 360) / 10 : null,
        },
        playing: n?.title ? `${n.title}${n.artist ? ` – ${n.artist}` : ''}` : null,
        gaming: g.active ? (g.game ?? 'on') : null,
        agent: { state: a.state, task: a.task, last: a.last, question: a.question },
        now: src.now?.() ?? '',
        activeChat: src.activeChat?.() ?? null,
        notices: src.notices(),
        approvals: ctx.pendingApprovals?.() ?? [],
        history: src.history(),
      };
    },
    message: (text) =>
      new Promise<string>((resolve) => {
        const id = `phone-${++seq}`;
        const timer = setTimeout(() => {
          replies.delete(id);
          resolve('No reply yet. The PC may be waiting for you to approve something on screen.');
        }, 3 * 60_000);
        replies.set(id, (t) => {
          clearTimeout(timer);
          replies.delete(id);
          resolve(t);
        });
        ctx.command({ type: 'remote-message', id, text });
      }),
    emergencyStop: () => {
      ctx.stopAgent?.();
      ctx.command({ type: 'emergency-stop' });
    },
    agentAnswer: (id, a) => ctx.agentAnswer?.(id, a),
    approve: (id, ok) => ctx.answerApproval?.(id, ok),
    uploadDir: () => join(app.getPath('downloads'), 'From phone'),
    log: (t) => ctx.audit.add('action', `Phone: ${t}`),
    allowPlainLan: () => ctx.settings.get().phonePlainLan,
  });
  // The encrypted address phones should use: Tailscale's HTTPS forwarding to this server.
  let secureUrl: string | null = null;
  const findSecureUrl = (): void => {
    if (process.platform !== 'win32') return;
    const installed = join(
      process.env.ProgramFiles ?? 'C:\\Program Files',
      'Tailscale',
      'tailscale.exe',
    );
    const exe = existsSync(installed) ? installed : 'tailscale';
    execFile(exe, ['serve', 'status'], { windowsHide: true, timeout: 10_000 }, (_e, out) => {
      secureUrl = serveUrlFor(String(out ?? ''), REMOTE_PORT);
    });
  };
  findSecureUrl();
  setInterval(findSecureUrl, 5 * 60_000).unref?.();

  const info = (): RemoteInfo => ({
    running: server.running,
    urls: server.running ? lanUrls() : [],
    code: server.pairingCode(),
    paired: server.pairedCount(),
    error,
    macs: macs(),
    secureUrl,
    plainLan: ctx.settings.get().phonePlainLan,
  });

  const apply = async (on: boolean): Promise<void> => {
    if (on && !server.running) {
      try {
        await server.start();
        error = null;
      } catch (err) {
        error = `Couldn't start (${err instanceof Error ? err.message : String(err)}). Is another copy running?`;
      }
    } else if (!on && server.running) server.stop();
  };
  void apply(ctx.settings.get().phoneAccess);
  ctx.phoneLink = () => ({
    wanted: ctx.settings.get().phoneAccess,
    running: server.running,
    error,
  });
  ctx.settings.subscribe((next, prev) => {
    if (next.phoneAccess !== prev.phoneAccess) void apply(next.phoneAccess);
  });

  handle(IPC.remote.status, () => info());
  handle(IPC.remote.newCode, () => {
    if (server.running) server.newCode();
    return info();
  });
  handle(IPC.remote.forget, () => {
    server.forgetAll();
    return info();
  });
  on(
    IPC.remote.reply,
    (_w, id, text) => replies.get(String(id))?.(String(text).slice(0, 8000)),
    ctx.getWindow,
  );
  app.on('will-quit', () => server.stop());
}
