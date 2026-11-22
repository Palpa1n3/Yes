import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  emailRule,
  eveningRule,
  inQuietHours,
  memoryRule,
  rainRule,
  type InitiativeInput,
} from '@shared/initiative';
import type { SystemStats } from '@shared/types';
import type { WeatherData } from '@shared/weather';
import { Initiative } from '../../src/main/services/initiative';
import { MemoryLearner, cleanFacts } from '../../src/main/services/memory-learner';
import { ErrorLog, SourceReader } from '../../src/main/services/diagnostics';
import { ChatStore } from '../../src/main/services/chat-store';

const at = new Date(2026, 10, 19, 14, 0);
const GB = 1024 ** 3;
const stats = (usedGB: number, top: { name: string; gb: number }): SystemStats =>
  ({
    memory: { used: usedGB * GB, total: 16 * GB, swapUsed: 0, swapTotal: 0 },
    processes: [{ pid: 1, name: top.name, cpu: 3, mem: top.gb * GB }],
  }) as unknown as SystemStats;
const base = (p: Partial<InitiativeInput> = {}): InitiativeInput => ({
  now: at,
  stats: null,
  events: null,
  weather: null,
  email: [],
  routines: [],
  userName: 'Jack',
  ...p,
});

describe('suggestion rules', () => {
  it('quiet hours wrap past midnight', () => {
    expect(inQuietHours(23, 22, 8)).toBe(true);
    expect(inQuietHours(3, 22, 8)).toBe(true);
    expect(inQuietHours(12, 22, 8)).toBe(false);
    expect(inQuietHours(13, 13, 15)).toBe(true);
    expect(inQuietHours(5, 9, 9)).toBe(false);
  });

  it('memory hog', () => {
    expect(
      memoryRule(base({ stats: stats(15, { name: 'chrome.exe', gb: 6 }) }))?.action?.intent,
    ).toEqual({
      action: 'close_app',
      target: 'chrome',
    });
    expect(memoryRule(base({ stats: stats(10, { name: 'chrome.exe', gb: 6 }) }))).toBeNull();
    expect(memoryRule(base({ stats: stats(15, { name: 'chrome.exe', gb: 1 }) }))).toBeNull();
    expect(memoryRule(base({ stats: stats(15, { name: 'explorer.exe', gb: 6 }) }))).toBeNull();
  });

  it('rain before an event', () => {
    const start = new Date(2026, 10, 19, 16, 0).getTime();
    const weather = {
      hourly: [{ time: '2026-11-19T16:00', hour: 16, temp: 8, code: 61, rainChance: 80 }],
    } as unknown as WeatherData;
    const events = [{ id: 'e1', title: 'Dentist', start, end: start + 3600_000, allDay: false }];
    expect(rainRule(base({ events, weather }))?.text).toMatch(/Dentist.*80% chance of rain/);
    const dry = { hourly: [{ ...weather.hourly[0], rainChance: 10 }] } as unknown as WeatherData;
    expect(rainRule(base({ events, weather: dry }))).toBeNull();
  });

  it('important unread email, not promotions', () => {
    const e = (subject: string, unread = true) => ({
      uid: 7,
      from: 'Boss <boss@work.com>',
      subject,
      date: at.getTime() - 60_000,
      unread,
    });
    expect(emailRule(base({ email: [e('Action required: sign the contract')] }))?.text).toMatch(
      /Boss/,
    );
    expect(emailRule(base({ email: [e('URGENT: 50% off sale ends today')] }))).toBeNull();
    expect(emailRule(base({ email: [e('Action required', false)] }))).toBeNull();
  });

  it('evening wind-down offers a bedtime routine', () => {
    const night = new Date(2026, 10, 19, 21, 45);
    const r = eveningRule(
      base({
        now: night,
        routines: [{ id: 'r1', name: 'Bedtime', phrases: [], steps: [] } as never],
      }),
    );
    expect(r?.action?.intent).toEqual({ action: 'run_routine', target: 'r1' });
    expect(eveningRule(base())).toBeNull();
  });
});

describe('Initiative engine', () => {
  const make = (over: Partial<ConstructorParameters<typeof Initiative>[0]> = {}) => {
    let now = at.getTime();
    const emit = vi.fn();
    const engine = new Initiative({
      input: () => base({ now: new Date(now), stats: stats(15, { name: 'chrome.exe', gb: 6 }) }),
      enabled: () => true,
      quietHours: () => ({ start: 22, end: 8 }),
      busy: () => false,
      idleSec: () => 5,
      emit,
      now: () => now,
      ...over,
    });
    return { engine, emit, tick: (ms: number) => (now += ms) };
  };

  it('suggests once, then respects the cooldown', async () => {
    const { engine, emit, tick } = make();
    expect(await engine.tick()).not.toBeNull();
    tick(30 * 60_000);
    expect(await engine.tick()).toBeNull(); // same suggestion already shown
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when off, busy, away or in quiet hours', async () => {
    expect(await make({ enabled: () => false }).engine.tick()).toBeNull();
    expect(await make({ busy: () => true }).engine.tick()).toBeNull();
    expect(await make({ idleSec: () => 3600 }).engine.tick()).toBeNull();
    expect(await make({ quietHours: () => ({ start: 13, end: 15 }) }).engine.tick()).toBeNull();
  });
});

describe('memory learning', () => {
  it('cleans facts: no secrets, no duplicates', () => {
    expect(
      cleanFacts(
        [
          'Their dog is called Max.',
          'Their dog is called Max.',
          'Their password is hunter2',
          'ok',
          42,
        ],
        ['They live in Leeds.'],
      ),
    ).toEqual([{ text: 'Their dog is called Max.', category: 'other' }]);
    expect(cleanFacts([{ text: 'Their sister is Amy.', category: 'people' }], [])).toEqual([
      { text: 'Their sister is Amy.', category: 'people' },
    ]);
  });

  it('reads new messages once and saves facts as learned', async () => {
    const remember = vi.fn();
    const create = vi.fn(async () => ({
      content: [
        {
          type: 'tool_use',
          id: 't',
          name: 'save_facts',
          input: { facts: [{ text: 'They work as a plumber.', category: 'work' }] },
        },
      ],
    }));
    const msgs = [
      {
        id: '1',
        role: 'user' as const,
        text: 'I need a quote template for my plumbing jobs please',
        timestamp: 10,
      },
      { id: '2', role: 'assistant' as const, text: 'Sure, here it is.', timestamp: 11 },
    ];
    const l = new MemoryLearner({
      client: async () => ({ beta: { messages: { create } } }) as never,
      enabled: () => true,
      memories: () => [],
      remember,
      messages: () => msgs as never,
    });
    expect(await l.learn('c1')).toEqual([{ text: 'They work as a plumber.', category: 'work' }]);
    expect(remember).toHaveBeenCalledWith('They work as a plumber.', 'work');
    expect(await l.learn('c1')).toEqual([]); // nothing new since
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does nothing when switched off or the chat is trivial', async () => {
    const create = vi.fn();
    const l = new MemoryLearner({
      client: async () => ({ beta: { messages: { create } } }) as never,
      enabled: () => true,
      memories: () => [],
      remember: vi.fn(),
      messages: () => [{ id: '1', role: 'user', text: 'hi', timestamp: 1 }],
    });
    expect(await l.learn('c')).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('search past chats', () => {
  it('finds excerpts across chats, best match first', () => {
    const root = mkdtempSync(join(tmpdir(), 'arc-ex-'));
    const s = new ChatStore({ dir: join(root, 'chats'), persist: () => true });
    s.load();
    const a = s.create();
    s.save(a.id, [
      { id: 'u1', role: 'user', text: 'Give me a lasagne recipe with spinach', timestamp: 1 },
      {
        id: 'a1',
        role: 'assistant',
        text: 'Here is a spinach lasagne recipe: layer pasta…',
        timestamp: 2,
        streaming: false,
        revealed: true,
      },
    ]);
    const b = s.create();
    s.save(b.id, [{ id: 'u2', role: 'user', text: 'My router keeps dropping wifi', timestamp: 3 }]);
    const hits = s.excerpts('that lasagne recipe');
    expect(hits.length).toBe(2);
    expect(hits[0]?.text).toMatch(/lasagne/);
    expect(s.excerpts('router')[0]?.text).toMatch(/router/);
    expect(s.excerpts('the and')).toEqual([]);
  });
});

describe('self-debugging', () => {
  it('keeps a log and hides secrets', () => {
    const log = new ErrorLog();
    log.add('error', 'main', 'Something broke');
    log.add('warn', 'ui', 'key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789');
    const t = log.tail();
    expect(t[0]).toMatch(/ERROR \[main\] Something broke/);
    expect(t[1]).toMatch(/hidden/);
  });

  it('reads source read-only, inside the project only', () => {
    const root = mkdtempSync(join(tmpdir(), 'arc-src-'));
    writeFileSync(join(root, 'package.json'), '{"name":"arc"}');
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'a.ts'), 'const x = 1;\nexport function hello() {}\n');
    writeFileSync(join(root, '.env'), 'SECRET=1');
    mkdirSync(join(root, 'node_modules'));
    writeFileSync(join(root, 'node_modules', 'b.js'), 'x');
    const r = new SourceReader(() => root);
    expect(r.files()).toEqual(['package.json', 'src/a.ts']);
    expect((r.tool({ path: 'src/a.ts' }) as { lines: string }).lines).toContain(
      '2\texport function hello',
    );
    expect(r.search('hello')).toEqual([
      { path: 'src/a.ts', line: 2, text: 'export function hello() {}' },
    ]);
    expect(() => r.read('../outside.txt')).toThrow(/outside/);
    expect(() => r.read('.env')).toThrow(/not readable/);
    expect(() => r.read('node_modules/b.js')).toThrow(/not readable/);
    expect(() => new SourceReader(() => '').files()).toThrow(/Settings/);
    // The copy shipped inside the app has src/ but no package.json.
    const shipped = mkdtempSync(join(tmpdir(), 'arc-shipped-'));
    mkdirSync(join(shipped, 'src', 'main'), { recursive: true });
    writeFileSync(join(shipped, 'src', 'main', 'index.ts'), 'export const x = 1;');
    expect(new SourceReader(() => shipped).files()).toContain('src/main/index.ts');
  });
});

describe('action history', () => {
  it('records, hides secrets, survives restarts and clears', async () => {
    const { AuditLog } = await import('../../src/main/services/diagnostics');
    const root = mkdtempSync(join(tmpdir(), 'arc-audit-'));
    const file = join(root, 'actions.jsonl');
    const a = new AuditLog(file);
    a.add('action', 'launch app: spotify → Opened Spotify');
    a.add('agent', 'Typing password=hunter2', false);
    const again = new AuditLog(file);
    expect(again.list().map((r) => r.text)).toEqual([
      'Typing password=[hidden]',
      'launch app: spotify → Opened Spotify',
    ]);
    again.clear();
    expect(new AuditLog(file).list()).toEqual([]);
  });
});
