import { phoneAvatarFor, THEME_ACCENT } from '@shared/looks';
/** The phone app's API (everything after pairing): chats with live replies, notes, PC controls,
 *  routines, timers, Agent Mode and a look at the screen. Messages are answered by the same
 *  Alton as on the PC (same chats, memory and approvals). */
import { toCommand, type CanonicalCommand, type CommandResult } from '@shared/commands';
import type { Source } from '@shared/chats';
import type { NotesOp } from '@shared/notes';
import type { Routine } from '@shared/routines';
import type { MainContext } from '../context';
import type { ChatStore } from '../services/chat-store';
import type { NotesStore } from '../services/notes-store';
import type { RouteResult } from '../services/remote-server';
import { buildSystemPrompt } from '@shared/personalities';
import type { PhoneChat, SyncFromPc, SyncToPc } from '@shared/phone';

export interface PhoneJob {
  id: string;
  chatId: string;
  text: string;
  activity: string;
  done: boolean;
  error?: string;
  sources?: Source[];
  at: number;
}

export interface JobProgress {
  text: string;
  activity: string;
  done: boolean;
  error?: string;
  sources?: Source[];
}

/** Actions the phone may run directly (the same as tapping a button on the PC). */
const PHONE_ACTIONS = new Set([
  'media_control',
  'set_volume',
  'launch_app',
  'close_app',
  'set_timer',
  'cancel_timer',
  'lock_screen',
  'run_routine',
  'open_url',
]);

export function makePhoneRoutes(
  ctx: MainContext,
  d: {
    chats: ChatStore;
    notes: NotesStore;
    routines(): Routine[];
    execute(cmd: CanonicalCommand): Promise<CommandResult>;
    screenshot(): Promise<Buffer | null>;
    /** MAC addresses of the network adapters (for Wake-on-LAN). */
    macs(): string[];
    sleep(): void;
  },
): {
  route(
    method: string,
    path: string,
    body: Record<string, unknown>,
    q: URLSearchParams,
  ): Promise<RouteResult | null>;
  progress(id: string, p: JobProgress): void;
} {
  const jobs = new Map<string, PhoneJob>();
  let seq = 0;
  const str = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.slice(0, max) : '');
  const ok = (json: unknown): RouteResult => ({ json });
  const bad = (msg: string, status = 400): RouteResult => ({ status, json: { error: msg } });

  const chatView = (id: string) => {
    const meta = d.chats.get(id);
    if (!meta) return null;
    return {
      meta,
      messages: d.chats.messages(id).flatMap((m) =>
        m.role === 'user'
          ? [
              {
                role: 'user',
                text: m.text,
                at: m.timestamp,
                images: (m.attachments ?? []).filter((a) => a.thumb).map((a) => a.thumb),
              },
            ]
          : m.role === 'assistant'
            ? [{ role: 'assistant', text: m.text, at: m.timestamp, sources: m.sources ?? [] }]
            : m.role === 'command'
              ? [
                  {
                    role: 'action',
                    text: `${m.command.cmd.action.replace(/_/g, ' ')}${m.command.cmd.target ? `: ${m.command.cmd.target}` : ''} · ${m.command.result?.message ?? m.command.status}`,
                    at: m.timestamp,
                  },
                ]
              : [],
      ),
    };
  };

  const route = async (
    method: string,
    path: string,
    body: Record<string, unknown>,
    q: URLSearchParams,
  ): Promise<RouteResult | null> => {
    const seg = path.split('/').filter(Boolean); // ['api', ...]
    if (seg[0] !== 'api') return null;
    const [, a, b, c] = seg;

    // ── Chats ──
    if (a === 'chats' && method === 'GET' && !b) {
      const query = str(q.get('q'), 200).trim();
      const s = d.chats.state();
      const ids = query ? new Set(d.chats.search(query)) : null;
      return ok({
        activeId: s.activeId,
        chats: ids ? s.chats.filter((x) => ids.has(x.id)) : s.chats,
      });
    }
    if (a === 'chats' && method === 'POST' && !b) return ok(d.chats.create(body.research === true));
    if (a === 'chats' && b && method === 'GET' && !c) {
      const v = chatView(b);
      return v ? ok(v) : bad('No such chat', 404);
    }
    if (a === 'chats' && b && method === 'POST' && c) {
      if (!d.chats.get(b)) return bad('No such chat', 404);
      if (c === 'rename') d.chats.rename(b, str(body.title, 80));
      else if (c === 'pin') d.chats.setPinned(b, body.on === true);
      else if (c === 'research') d.chats.setResearch(b, body.on === true);
      else if (c === 'delete') d.chats.remove(b);
      else return bad('Unknown');
      return ok({ ok: true });
    }

    // ── Sending a message (answered live; poll /api/job/<id>) ──
    if (a === 'send' && method === 'POST') {
      const text = str(body.text, 8000).trim();
      const images = (Array.isArray(body.images) ? body.images : []).slice(0, 4).flatMap((i) => {
        const o = i as { name?: unknown; data?: unknown; thumb?: unknown };
        return typeof o.data === 'string' && o.data.length < 6_000_000
          ? [{ name: str(o.name, 80) || 'photo.jpg', data: o.data, thumb: str(o.thumb, 60_000) }]
          : [];
      });
      if (!text && !images.length) return bad('Empty message');
      let chatId = str(body.chatId, 40);
      if (!chatId || !d.chats.get(chatId)) chatId = d.chats.create(body.research === true).id;
      const id = `job-${++seq}-${Date.now().toString(36)}`;
      jobs.set(id, { id, chatId, text: '', activity: 'Thinking…', done: false, at: Date.now() });
      // Old jobs are forgotten after a while.
      for (const [k, j] of jobs) if (Date.now() - j.at > 30 * 60_000) jobs.delete(k);
      ctx.command({ type: 'remote-message', id, text, chatId, images });
      ctx.audit.add(
        'action',
        `Phone: ${text.slice(0, 80)}${images.length ? ` (+${images.length} photo)` : ''}`,
      );
      return ok({ jobId: id, chatId });
    }
    if (a === 'job' && b && method === 'GET') {
      const j = jobs.get(b);
      return j ? ok(j) : bad('No such job', 404);
    }
    if (a === 'cancel' && method === 'POST') {
      ctx.command({ type: 'remote-cancel' });
      return ok({ ok: true });
    }

    // ── Notes, lists, goals, memories ──
    if (a === 'notes' && method === 'GET') return ok(d.notes.state());
    if (a === 'notes' && method === 'POST') {
      const op = body.op as NotesOp | undefined;
      if (!op || typeof op !== 'object' || typeof op.op !== 'string') return bad('Missing op');
      return ok(d.notes.apply(op));
    }

    // ── PC controls ──
    if (a === 'action' && method === 'POST') {
      const action = str(body.action, 40);
      if (!PHONE_ACTIONS.has(action)) return bad('Not allowed from the phone');
      const target = str(body.target, 300) || undefined;
      const args = Array.isArray(body.args)
        ? body.args.map((x) => str(x, 200)).slice(0, 3)
        : undefined;
      const cmd = toCommand(
        { action, ...(target ? { target } : {}), ...(args?.length ? { args } : {}) },
        `phone-${Date.now()}`,
      );
      const r = await d.execute(cmd);
      return ok(r);
    }
    if (a === 'routines' && method === 'GET')
      return ok(
        d.routines().map((r) => ({ id: r.id, name: r.name, icon: r.icon, phrases: r.phrases })),
      );
    if (a === 'timers' && method === 'GET') return ok(ctx.timers.list());
    if (a === 'timers' && method === 'POST') {
      const minutes = Number(body.minutes);
      if (!(minutes > 0 && minutes <= 1440)) return bad('Minutes must be 1–1440');
      ctx.timers.add(minutes, str(body.label, 120));
      return ok(ctx.timers.list());
    }
    if (a === 'timers' && b && method === 'POST' && c === 'cancel') {
      ctx.timers.cancel(b);
      return ok(ctx.timers.list());
    }
    if (a === 'agent' && b === 'start' && method === 'POST') {
      const task = str(body.task, 2000).trim();
      if (!task) return bad('Say what to do');
      ctx.startAgent?.(task);
      return ok({ ok: true });
    }
    // ── The phone-only app: what it needs from the PC, and what it brings back ──
    if (a === 'sync' && method === 'GET') {
      const st = ctx.settings.get();
      const recent = d.chats
        .state()
        .chats.slice()
        .sort((x, y) => y.updatedAt - x.updatedAt)
        .slice(0, 25);
      const payload: SyncFromPc = {
        v: 1,
        name: st.assistantName,
        userName: st.userName,
        systemPrompt: buildSystemPrompt(
          { ...st.personality, assistantName: st.assistantName },
          st.userName,
        ),
        model: st.model,
        memories: d.notes.memoryTexts(),
        lists: d.notes.state().lists.map((l) => ({
          name: l.name,
          items: l.items.map((i) => ({ text: i.text, done: i.done })),
        })),
        chats: recent.map((c) => ({
          id: c.phoneId ?? c.id,
          title: c.title,
          research: c.research,
          updatedAt: c.updatedAt,
          messages: d.chats
            .messages(c.id)
            .flatMap((m): PhoneChat['messages'] =>
              m.role === 'user'
                ? [{ role: 'user', text: m.text.slice(0, 4000), at: m.timestamp }]
                : m.role === 'assistant'
                  ? [
                      {
                        role: 'assistant',
                        text: m.text.slice(0, 8000),
                        at: m.timestamp,
                        ...(m.sources?.length ? { sources: m.sources.slice(0, 8) } : {}),
                      },
                    ]
                  : [],
            )
            .slice(-30),
        })),
        pcUrl: str(q.get('pc'), 200),
        macs: d.macs(),
        goals: d.notes
          .state()
          .goals.filter((g) => !g.done)
          .map((g) => ({ title: g.title, progress: g.progress })),
        notes: d.notes
          .state()
          .notes.slice(0, 30)
          .map((n) => n.text.slice(0, 2000)),
        prompts: st.prompts,
        voiceFixes: st.voiceFixes,
        look: {
          accent: st.avatarColor || THEME_ACCENT[st.theme],
          avatar: phoneAvatarFor(st.avatar),
        },
        at: Date.now(),
      };
      return ok({ payload, appUrl: st.phoneAppUrl });
    }
    if (a === 'import' && method === 'POST') {
      const data = body.data as SyncToPc | undefined;
      if (!data || data.v !== 1) return bad('Not a phone sync');
      let messages = 0;
      for (const c of (Array.isArray(data.chats) ? data.chats : []).slice(0, 50))
        if (c && typeof c.id === 'string' && Array.isArray(c.messages))
          messages += d.chats.importPhoneChat({
            ...c,
            title: str(c.title, 80),
            research: c.research === true,
          });
      let memories = 0;
      for (const m of (Array.isArray(data.memories) ? data.memories : []).slice(0, 100))
        if (typeof m === 'string' && d.notes.remember(m, true)) memories++;
      let items = 0;
      for (const li of (Array.isArray(data.listItems) ? data.listItems : []).slice(0, 200))
        if (li && typeof li.text === 'string') {
          d.notes.addItems(str(li.list, 60) || 'To-do', [str(li.text, 200)]);
          items++;
        }
      let ops = 0;
      for (const o of (Array.isArray(data.listOps) ? data.listOps : []).slice(0, 300))
        if (o && typeof o.text === 'string' && (o.op === 'done' || o.op === 'remove'))
          ops += d.notes.updateItems(str(o.list, 60) || null, str(o.text, 200), o.op).length;
      let notes = 0;
      for (const n of (Array.isArray(data.notes) ? data.notes : []).slice(0, 50))
        if (typeof n === 'string' && n.trim() && d.notes.addNote(n)) notes++;
      const shifts = ctx.shifts.merge(data.shifts);
      ctx.audit.add(
        'action',
        `Synced from the phone app: ${messages} messages, ${memories} memories, ${items} list items, ${ops} ticked/removed, ${notes} notes, ${shifts} shifts`,
      );
      return ok({ messages, memories, items, ops, notes, shifts });
    }
    if (a === 'power' && method === 'POST') {
      // The tap (and confirm) on the phone is the approval.
      const act = body.action;
      if (!ctx.power) return bad('Not ready yet');
      if (act === 'cancel') return ok({ message: await ctx.power.cancel() });
      if (act === 'download' || act === 'download-off') {
        const dm = ctx.power.download;
        if (!dm) return bad('Not ready yet');
        if (act === 'download-off') {
          await dm.stop();
          return ok({ message: 'Download mode off.' });
        }
        const then = body.then === 'shutdown' || body.then === 'sleep' ? body.then : 'none';
        const r = await dm.start(then);
        if ('error' in r) return bad(r.error);
        return ok({
          message: `Download mode on${r.games.length ? `: ${r.games.map((g) => g.name).join(', ')}` : ' (waiting for Steam)'}${then !== 'none' ? `, then ${then}` : ''}.`,
        });
      }
      if (act !== 'shutdown' && act !== 'restart') return bad('Unknown action');
      const m = await ctx.power.schedule(act, 60, 'from your phone');
      return ok({ message: m });
    }
    if (a === 'sleep' && method === 'POST') {
      if (process.platform !== 'win32') return bad('Sleep needs Windows');
      ctx.audit.add('action', 'Put the PC to sleep from the phone');
      setTimeout(() => d.sleep(), 1500);
      return ok({ ok: true });
    }
    if (a === 'agent' && b === 'pause' && method === 'POST') {
      ctx.pauseAgent?.(body.on === true);
      return ok({ ok: true });
    }
    if (a === 'screen' && method === 'GET') {
      if (!ctx.settings.get().screenAware)
        return bad('Screen awareness is off on the PC (Settings › Smart features).', 403);
      const jpeg = await d.screenshot();
      return jpeg ? { jpeg } : bad('Could not capture the screen', 500);
    }
    return null;
  };

  return {
    route,
    progress: (id, p) => {
      const j = jobs.get(id);
      if (!j) return;
      Object.assign(j, {
        text: p.text.slice(0, 60_000),
        activity: p.activity.slice(0, 200),
        done: p.done,
        ...(p.error ? { error: p.error.slice(0, 500) } : {}),
        ...(p.sources ? { sources: p.sources.slice(0, 20) } : {}),
      });
    },
  };
}
