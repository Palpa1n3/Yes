import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { KnowledgeService } from '../../src/main/services/knowledge';

const fakeClient = () => {
  const create = vi.fn(async () => ({
    usage: { input_tokens: 10, output_tokens: 10 },
    content: [
      {
        type: 'tool_use',
        name: 'save_graph',
        input: {
          entities: [{ name: 'Will', kind: 'person', aliases: ['Fives'], notes: ['female'] }],
          links: [{ from: 'Will', rel: 'shares shifts with', to: 'user' }],
        },
      },
    ],
  }));
  return { client: { beta: { messages: { create } } }, create };
};

describe('building the knowledge graph', () => {
  it('builds from memories, and only again when they change', async () => {
    const { client, create } = fakeClient();
    let memories = [
      'Will shares shifts with them.',
      'Will is also called Fives.',
      'They live in Neath.',
    ];
    const onUsage = vi.fn();
    const k = new KnowledgeService({
      file: join(mkdtempSync(join(tmpdir(), 'alton-kg-')), 'knowledge.json'),
      client: async () => client as never,
      memories: () => memories,
      blocked: () => null,
      onUsage,
    });
    expect((await k.rebuild()).ok).toBe(true);
    expect(k.get().entities.map((e) => e.name)).toEqual(['the user', 'Will']);
    expect(onUsage).toHaveBeenCalledTimes(1);
    expect((await k.rebuild()).message).toBe('Already up to date.');
    expect(create).toHaveBeenCalledTimes(1);
    memories = [...memories, 'They play Minecraft.'];
    await k.rebuild();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('waits when the spending limit pauses background work', async () => {
    const { client, create } = fakeClient();
    const k = new KnowledgeService({
      file: join(mkdtempSync(join(tmpdir(), 'alton-kg-')), 'knowledge.json'),
      client: async () => client as never,
      memories: () => ['a fact', 'another fact', 'a third fact'],
      blocked: () => 'Paused: limit reached.',
    });
    expect(await k.rebuild()).toEqual({ ok: false, message: 'Paused: limit reached.' });
    expect(create).not.toHaveBeenCalled();
  });
});
