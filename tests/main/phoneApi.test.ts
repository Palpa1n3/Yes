import { ShiftStore } from '../../src/main/services/shift-store';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { makePhoneRoutes } from '../../src/main/ipc/remote-api';
import { ChatStore } from '../../src/main/services/chat-store';
import { NotesStore } from '../../src/main/services/notes-store';
import type { MainContext } from '../../src/main/context';
import { DEFAULT_SETTINGS } from '@shared/types';

function setup() {
  const chats = new ChatStore({
    dir: join(mkdtempSync(join(tmpdir(), 'arc-ph-')), 'chats'),
    persist: () => true,
  });
  chats.load();
  const notes = new NotesStore({});
  const command = vi.fn();
  const timers: Array<{ id: string; label: string }> = [];
  const ctx = {
    command,
    audit: { add: vi.fn() },
    shifts: new ShiftStore(),
    settings: { get: () => ({ ...DEFAULT_SETTINGS, screenAware: false }) },
    timers: {
      list: () => timers,
      add: (m: number, label: string) => timers.push({ id: `t${m}`, label }),
      cancel: (id: string) =>
        timers.splice(
          timers.findIndex((t) => t.id === id),
          1,
        ),
    },
    startAgent: vi.fn(),
    pauseAgent: vi.fn(),
  } as unknown as MainContext;
  const execute = vi.fn(async () => ({
    commandId: 'x',
    status: 'success' as const,
    message: 'Paused',
    timestamp: 0,
  }));
  const api = makePhoneRoutes(ctx, {
    chats,
    notes,
    routines: () => [],
    execute,
    live: async () => Buffer.from([1]),
    input: vi.fn(async () => undefined),
    screenshot: async () => null,
    macs: () => ['AA:BB:CC:DD:EE:FF'],
    sleep: vi.fn(),
  });
  const call = (m: string, p: string, body: Record<string, unknown> = {}, q = '') =>
    api.route(m, p, body, new URLSearchParams(q));
  return { api, call, chats, command, execute, ctx };
}

describe('phone-only app sync', () => {
  it('gives the phone memories, lists, chats and the MAC, and takes phone chats back', async () => {
    const { call, chats } = setup();
    const c = chats.create();
    chats.save(c.id, [{ id: 'u', role: 'user', text: 'hi from pc', timestamp: 10 }]);
    const s = (await call('GET', '/api/sync', {}, 'pc=http://192.168.1.5:47615')) as {
      json: {
        payload: {
          chats: Array<{ id: string; messages: unknown[] }>;
          macs: string[];
          pcUrl: string;
          systemPrompt: string;
        };
        appUrl: string;
      };
    };
    expect(s.json.appUrl).toMatch(/^https:\/\//);
    expect(s.json.payload.macs).toEqual(['AA:BB:CC:DD:EE:FF']);
    expect(s.json.payload.pcUrl).toBe('http://192.168.1.5:47615');
    expect(s.json.payload.systemPrompt.length).toBeGreaterThan(20);
    expect(s.json.payload.chats[0]?.messages).toHaveLength(1);
    const phoneChat = {
      id: 'p-abc',
      title: 'Text mum',
      research: false,
      updatedAt: 50,
      messages: [
        { role: 'user', text: 'text mum', at: 20 },
        { role: 'assistant', text: 'Ready to send', at: 21 },
      ],
    };
    const r = (await call('POST', '/api/import', {
      data: {
        v: 1,
        chats: [phoneChat],
        memories: ['Mum is called Sue'],
        listItems: [{ list: 'Shopping', text: 'eggs' }],
      },
    })) as { json: { messages: number; memories: number; items: number } };
    expect(r.json).toEqual({ messages: 2, memories: 1, items: 1, ops: 0, notes: 0, shifts: 0 });
    // Sending the same chat again (with one more message) adds only the new one, to the same chat.
    phoneChat.messages.push({ role: 'user', text: 'thanks', at: 30 });
    const again = (await call('POST', '/api/import', {
      data: { v: 1, chats: [phoneChat], memories: [], listItems: [] },
    })) as {
      json: { messages: number };
    };
    expect(again.json.messages).toBe(1);
    expect(chats.state().chats.filter((x) => x.phoneId === 'p-abc')).toHaveLength(1);
    expect(chats.state().activeId).toBe(c.id); // the PC's open chat didn't change
  });
});

describe('phone app API', () => {
  it('lists, creates, renames and deletes chats', async () => {
    const { call } = setup();
    const created = (await call('POST', '/api/chats', { research: true })) as {
      json: { id: string; research: boolean };
    };
    expect(created.json.research).toBe(true);
    await call('POST', `/api/chats/${created.json.id}/rename`, { title: 'Trip ideas' });
    const list = (await call('GET', '/api/chats')) as { json: { chats: Array<{ title: string }> } };
    expect(list.json.chats.map((c) => c.title)).toContain('Trip ideas');
    await call('POST', `/api/chats/${created.json.id}/delete`);
    expect(
      ((await call('GET', `/api/chats/${created.json.id}`)) as { status: number }).status,
    ).toBe(404);
  });

  it('sends a message to the PC and streams the reply through a job', async () => {
    const { call, api, command } = setup();
    const r = (await call('POST', '/api/send', {
      text: 'hello',
      images: [{ name: 'a.jpg', data: 'QUJD', thumb: 'data:image/jpeg;base64,x' }],
    })) as {
      json: { jobId: string; chatId: string };
    };
    expect(command).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'remote-message',
        text: 'hello',
        chatId: r.json.chatId,
        images: [expect.objectContaining({ data: 'QUJD' })],
      }),
    );
    api.progress(r.json.jobId, { text: 'Hi th', activity: 'Thinking…', done: false });
    expect(
      ((await call('GET', `/api/job/${r.json.jobId}`)) as { json: { text: string; done: boolean } })
        .json,
    ).toMatchObject({ text: 'Hi th', done: false });
    api.progress(r.json.jobId, {
      text: 'Hi there',
      activity: '',
      done: true,
      sources: [{ url: 'https://a.b', title: 'A' }],
    });
    expect(
      (
        (await call('GET', `/api/job/${r.json.jobId}`)) as {
          json: { done: boolean; sources: unknown[] };
        }
      ).json,
    ).toMatchObject({ done: true, sources: [{ url: 'https://a.b' }] });
    expect(((await call('POST', '/api/send', {})) as { status: number }).status).toBe(400);
  });

  it('edits notes, runs allowed actions only, manages timers and the agent', async () => {
    const { call, execute, ctx } = setup();
    const n = (await call('POST', '/api/notes', {
      op: { op: 'addItems', list: 'Shopping', items: ['milk'] },
    })) as { json: { lists: Array<{ name: string }> } };
    expect(n.json.lists[0]?.name).toBe('Shopping');
    await call('POST', '/api/action', { action: 'media_control', target: 'play_pause' });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'media_control', target: 'play_pause' }),
    );
    expect(
      (
        (await call('POST', '/api/action', { action: 'find_files', target: 'x' })) as {
          status: number;
        }
      ).status,
    ).toBe(400);
    await call('POST', '/api/timers', { minutes: 5, label: 'tea' });
    expect(((await call('GET', '/api/timers')) as { json: unknown[] }).json).toHaveLength(1);
    await call('POST', '/api/agent/start', { task: 'open notepad' });
    expect(ctx.startAgent).toHaveBeenCalledWith('open notepad');
    expect(((await call('GET', '/api/screen')) as { status: number }).status).toBe(403); // screen awareness off
    expect(await call('GET', '/api/nope')).toBeNull();
  });
});

describe('remote control from the phone', () => {
  it('is refused unless "Let my phone control this PC" is on', async () => {
    const { call } = setup();
    const live = (await call('GET', '/api/live')) as { status?: number };
    expect(live.status).toBe(403);
    const inp = (await call('POST', '/api/input', { type: 'click', x: 0.5, y: 0.5 })) as {
      status?: number;
    };
    expect(inp.status).toBe(403);
  });
});
