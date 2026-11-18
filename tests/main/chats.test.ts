import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { chatGroup, chatToMarkdown, titleFrom, type ChatMeta } from '@shared/chats';
import type { StoredMessage } from '@shared/types';
import {
  AnthropicProvider,
  sourcesFrom,
  webTools,
} from '../../src/main/services/anthropic-provider';
import { ChatStore } from '../../src/main/services/chat-store';
import { snapshot } from '../../src/main/services/system-stats';

const u = (id: string, text: string, t = 1): StoredMessage => ({
  id,
  role: 'user',
  text,
  timestamp: t,
});
const a = (id: string, text: string, t = 2): Extract<StoredMessage, { role: 'assistant' }> => ({
  id,
  role: 'assistant',
  text,
  timestamp: t,
  streaming: false,
  revealed: true,
});

function store(opts: { persist?: boolean; legacy?: StoredMessage[] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'arc-chats-'));
  const legacy = join(root, 'history.json');
  if (opts.legacy) writeFileSync(legacy, JSON.stringify(opts.legacy));
  let now = 1_000_000;
  const onChange = vi.fn();
  const s = new ChatStore({
    dir: join(root, 'chats'),
    legacyHistory: legacy,
    persist: () => opts.persist ?? true,
    now: () => now,
    onChange,
  });
  s.load();
  return { s, root, legacy, onChange, tick: (ms: number) => (now += ms) };
}

describe('ChatStore', () => {
  it('starts with one chat and moves the old conversation into it', () => {
    const { s, legacy } = store({
      legacy: [u('1', 'what is the capital of peru?'), a('2', 'Lima.')],
    });
    const st = s.state();
    expect(st.chats).toHaveLength(1);
    expect(st.chats[0]?.title).toBe('What is the capital of peru');
    expect(s.messages(st.activeId).map((m) => m.id)).toEqual(['1', '2']);
    expect(existsSync(legacy)).toBe(false);
    expect(store().s.state().chats[0]?.title).toBe('New chat');
  });

  it('creates, names from the first question, saves, reopens and survives a restart', () => {
    const { s, root, tick } = store();
    const first = s.state().activeId;
    s.save(first, [u('0', 'hello')]);
    tick(1000);
    const b = s.create(true);
    expect(b.id).not.toBe(first);
    expect(b.research).toBe(true);
    expect(s.state().activeId).toBe(b.id);
    s.save(b.id, [
      u('x', 'compare the best budget gaming mice in 2026 for small hands please'),
      a('y', 'Here…'),
    ]);
    expect(s.get(b.id)?.title).toBe('Compare the best budget gaming mice in 2026 for…');
    expect(s.open(first)).toHaveLength(1);
    const again = new ChatStore({ dir: join(root, 'chats'), persist: () => true });
    again.load();
    expect(again.state().activeId).toBe(first);
    expect(again.messages(b.id)).toHaveLength(2);
    expect(again.get(b.id)?.research).toBe(true);
  });

  it('reuses an empty new chat instead of piling them up', () => {
    const { s } = store();
    const a1 = s.create();
    const a2 = s.create();
    expect(a2.id).toBe(a1.id);
    expect(s.state().chats).toHaveLength(1);
  });

  it('renames, pins, removes and searches', () => {
    const { s, tick } = store();
    const one = s.state().activeId;
    s.save(one, [u('1', 'pasta recipes'), a('2', 'Try carbonara with guanciale.')]);
    tick(1000);
    const two = s.create().id;
    s.save(two, [u('3', 'fix my wifi')]);
    s.rename(one, '  Dinner ideas  ');
    s.setPinned(one, true);
    expect(s.get(one)).toMatchObject({ title: 'Dinner ideas', pinned: true });
    expect(s.search('guanciale')).toEqual([one]);
    expect(s.search('wifi')).toEqual([two]);
    expect(s.search('')).toHaveLength(2);
    const after = s.remove(two);
    expect(after.chats.map((c) => c.id)).toEqual([one]);
    expect(after.activeId).toBe(one);
  });

  it('only real messages move a chat up; drafts are settled when saved', () => {
    const { s, tick } = store();
    const id = s.state().activeId;
    const before = s.get(id)?.updatedAt;
    tick(5000);
    s.save(id, [{ id: 'g', role: 'system', text: 'Restored', timestamp: 1, tone: 'info' }]);
    expect(s.get(id)?.updatedAt).toBe(before);
    s.save(id, [u('1', 'hi'), { ...a('2', 'Hel'), streaming: true, revealed: false }]);
    expect(s.get(id)?.updatedAt).toBeGreaterThan(before ?? 0);
    expect(s.messages(id)[1]).toMatchObject({ streaming: false, revealed: true });
  });

  it('keeps chats only in memory when "Remember chats" is off', () => {
    const { s, root } = store({ persist: false });
    s.save(s.state().activeId, [u('1', 'secret plans')]);
    expect(s.messages(s.state().activeId)).toHaveLength(1);
    expect(existsSync(join(root, 'chats'))).toBe(false);
  });
});

describe('chat helpers', () => {
  it('titles, groups and exports', () => {
    expect(titleFrom('  hello there?? ')).toBe('Hello there');
    expect(titleFrom('')).toBe('New chat');
    const now = new Date(2026, 10, 18, 12).getTime();
    const meta = (updatedAt: number, pinned = false): ChatMeta => ({
      id: 'c1234567',
      title: 'T',
      createdAt: 0,
      updatedAt,
      pinned,
      research: false,
    });
    expect(chatGroup(meta(now - 3600_000), now)).toBe('Today');
    expect(chatGroup(meta(now - 26 * 3600_000), now)).toBe('Yesterday');
    expect(chatGroup(meta(now - 4 * 86_400_000), now)).toBe('Previous 7 days');
    expect(chatGroup(meta(0), now)).toBe('Older');
    expect(chatGroup(meta(0, true), now)).toBe('Pinned');
    const md = chatToMarkdown(
      meta(0),
      [
        u('1', 'Best GPU?'),
        { ...a('2', 'The **RTX** one.'), sources: [{ url: 'https://ex.com/a', title: 'Ex' }] },
      ],
      'ARC',
    );
    expect(md).toContain('**You:** Best GPU?');
    expect(md).toContain('- [Ex](https://ex.com/a)');
  });
});

describe('research mode and per-chat context', () => {
  function fake(
    script: Array<{ content: unknown[]; stop_reason: string }>,
    events: unknown[] = [],
  ) {
    const calls: Array<Record<string, unknown>> = [];
    const stream = vi.fn((params: Record<string, unknown>) => {
      calls.push(structuredClone(params));
      const msg = script.shift();
      return {
        async *[Symbol.asyncIterator]() {
          for (const e of events) yield e;
        },
        finalMessage: async () => msg,
      };
    });
    const client = {
      beta: { messages: { stream } },
      models: { retrieve: vi.fn() },
    } as unknown as Pick<Anthropic, 'beta' | 'models'>;
    const p = new AnthropicProvider({
      getKey: async () => 'sk-ant-x',
      model: () => 'claude-haiku-5-5',
      researchModel: () => 'claude-sonnet-5-5',
      systemPrompt: () => 'You are ARC.',
      info: () => null,
      stats: snapshot,
      apps: () => [],
      createClient: () => client,
    });
    return { p, calls };
  }
  const run = async (p: AnthropicProvider, text: string, research = false) => {
    const out: Array<Record<string, unknown>> = [];
    for await (const c of p.send([{ role: 'user', content: text }], { systemPrompt: '', research }))
      out.push(c as Record<string, unknown>);
    return out;
  };

  it('uses the research model, web tools, more effort and reports sources', async () => {
    const cited = {
      type: 'text',
      text: 'Lima is the capital.',
      citations: [
        {
          type: 'web_search_result_location',
          url: 'https://en.wikipedia.org/wiki/Lima',
          title: 'Lima - Wikipedia',
          cited_text: '…',
          encrypted_index: 'x',
        },
        {
          type: 'web_search_result_location',
          url: 'https://en.wikipedia.org/wiki/Lima',
          title: 'dup',
          cited_text: '…',
          encrypted_index: 'y',
        },
      ],
    };
    const { p, calls } = fake(
      [
        {
          content: [
            {
              type: 'server_tool_use',
              id: 's1',
              name: 'web_search',
              input: { query: 'capital of peru' },
            },
            cited,
          ],
          stop_reason: 'end_turn',
        },
      ],
      [
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'server_tool_use', id: 's1', name: 'web_search', input: {} },
        },
      ],
    );
    const out = await run(p, 'capital of peru?', true);
    expect(calls[0]).toMatchObject({
      model: 'claude-sonnet-5-5',
      output_config: { effort: 'medium' },
    });
    const tools = (calls[0]!['tools'] as Array<{ name: string; type?: string }>).map(
      (t) => t.type ?? t.name,
    );
    expect(tools).toContain('web_search_20260209');
    expect(tools).toContain('web_fetch_20260209');
    const note = (calls[0]!['messages'] as Array<{ role: string; content: string }>).at(
      -1,
    )!.content;
    expect(note).toMatch(/Research mode is on/);
    expect(out).toContainEqual({ type: 'activity', text: 'Searching the web…' });
    expect(out).toContainEqual({
      type: 'sources',
      sources: [{ url: 'https://en.wikipedia.org/wiki/Lima', title: 'Lima - Wikipedia' }],
    });
    expect(out.at(-1)).toEqual({ type: 'done' });
  });

  it('normal chats stay quick and cheap; Haiku gets the basic web tools', async () => {
    const { p, calls } = fake([
      { content: [{ type: 'text', text: 'Hi' }], stop_reason: 'end_turn' },
    ]);
    await run(p, 'hello');
    expect(calls[0]).toMatchObject({ model: 'claude-haiku-5-5', output_config: { effort: 'low' } });
    expect(JSON.stringify(calls[0]!['tools'])).not.toContain('web_search');
    expect(webTools('claude-haiku-5-5').map((t) => t.type)).toEqual([
      'web_search_20250305',
      'web_fetch_20250910',
    ]);
    expect(sourcesFrom([{ role: 'user', content: 'x' }])).toEqual([]);
  });

  it('a reopened chat continues from its saved turns', async () => {
    const { p, calls } = fake([
      { content: [{ type: 'text', text: 'Sure.' }], stop_reason: 'end_turn' },
    ]);
    p.seed([
      { role: 'assistant', content: 'Good morning.' }, // a greeting first is skipped
      { role: 'user', content: 'My dog is called Biscuit.' },
      { role: 'assistant', content: 'Lovely name.' },
      { role: 'user', content: 'unanswered' },
    ]);
    await run(p, "what's my dog called?");
    const msgs = calls[0]!['messages'] as Array<{ role: string; content: string }>;
    expect(msgs.slice(0, 2)).toEqual([
      { role: 'user', content: 'My dog is called Biscuit.' },
      { role: 'assistant', content: 'Lovely name.' },
    ]);
    expect(msgs[2]).toEqual({ role: 'user', content: "what's my dog called?" });
  });
});
