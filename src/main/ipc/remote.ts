import { app, desktopCapturer, screen } from 'electron';
import { networkInterfaces } from 'node:os';
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
  },
): void {
  const replies = new Map<string, (text: string) => void>();
  let seq = 0;
  let error: string | null = null;

  // ── Remote control from the phone ──
  let liveDisplay: Electron.Display | null = null;
  let input: WinInput | null = null;
  let lastNotice = 0;
  const noticeControl = (what: 'viewing' | 'controlling'): void => {
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
    live: async () => {
      noticeControl('viewing');
      const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      liveDisplay = d;
      const k = Math.min(1, 1100 / Math.max(d.size.width, d.size.height));
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.round(d.size.width * k),
          height: Math.round(d.size.height * k),
        },
      });
      const s = sources.find((x) => x.display_id === String(d.id)) ?? sources[0];
      return s && !s.thumbnail.isEmpty() ? s.thumbnail.toJPEG(55) : null;
    },
    input: (cmd) => remoteInput(cmd),
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
  });

  const info = (): RemoteInfo => ({
    running: server.running,
    urls: server.running ? lanUrls() : [],
    code: server.pairingCode(),
    paired: server.pairedCount(),
    error,
    macs: macs(),
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
