import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { attachmentBlocks, kindOf, type Attachment } from '@shared/attachments';
import type { ProviderChunk } from '@shared/types';
import { MockProvider } from '../../src/main/services/ai-provider';
import { AnthropicProvider } from '../../src/main/services/anthropic-provider';
import { snapshot } from '../../src/main/services/system-stats';

const img: Attachment = {
  name: 'error.png',
  kind: 'image',
  mime: 'image/jpeg',
  data: 'AAAA',
  size: 3,
};
const pdf: Attachment = {
  name: 'manual.pdf',
  kind: 'pdf',
  mime: 'application/pdf',
  data: 'JVBERi0=',
  size: 5,
};
const txt: Attachment = {
  name: 'notes.txt',
  kind: 'text',
  mime: 'text/plain',
  data: 'hello',
  size: 5,
};

describe('attachments', () => {
  it('knows what Claude can read', () => {
    expect(kindOf('a.png', 'image/png')).toBe('image');
    expect(kindOf('scan.pdf', '')).toBe('pdf');
    expect(kindOf('script.py', '')).toBe('text');
    expect(kindOf('data.json', 'application/json')).toBe('text');
    expect(kindOf('game.exe', 'application/x-msdownload')).toBeNull();
    expect(kindOf('song.mp3', 'audio/mpeg')).toBeNull();
  });

  it('become image and document blocks', () => {
    expect(attachmentBlocks([img, pdf, txt])).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
      {
        type: 'document',
        title: 'manual.pdf',
        source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0=' },
      },
      {
        type: 'document',
        title: 'notes.txt',
        source: { type: 'text', media_type: 'text/plain', data: 'hello' },
      },
    ]);
  });

  it('are sent to Claude before the question', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const stream = vi.fn((params: Record<string, unknown>) => {
      calls.push(structuredClone(params));
      return {
        async *[Symbol.asyncIterator]() {},
        finalMessage: async () => ({
          content: [{ type: 'text', text: 'It says…' }],
          stop_reason: 'end_turn',
        }),
      };
    });
    const p = new AnthropicProvider({
      getKey: async () => 'sk-ant-x',
      model: () => 'claude-haiku-5-5',
      systemPrompt: () => '',
      info: () => null,
      stats: snapshot,
      apps: () => [],
      createClient: () =>
        ({ beta: { messages: { stream } }, models: {} }) as unknown as Pick<
          Anthropic,
          'beta' | 'models'
        >,
    });
    for await (const c of p.send([{ role: 'user', content: 'what does this say?' }], {
      systemPrompt: '',
      attachments: [img],
    }))
      void c;
    const user = (calls[0]!['messages'] as Array<{ role: string; content: unknown }>)[0]!;
    expect(user.content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
      { type: 'text', text: 'what does this say?' },
    ]);
  });

  it('the offline brain explains it needs Claude', async () => {
    const out: ProviderChunk[] = [];
    for await (const c of new MockProvider().send([{ role: 'user', content: 'read this' }], {
      systemPrompt: '',
      attachments: [txt],
    }))
      out.push(c);
    expect(out.map((c) => (c.type === 'text' ? c.delta : '')).join('')).toMatch(/Connect Claude/);
  });
});
