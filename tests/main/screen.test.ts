import { describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicProvider } from '../../src/main/services/anthropic-provider';
import { ScreenWatch, type Frame } from '../../src/main/services/screen-watch';
import { snapshot } from '../../src/main/services/system-stats';

const frame = (at: number): Frame => ({
  jpeg: Buffer.from('jpegbytes'),
  at,
  width: 1568,
  height: 882,
});

describe('ScreenWatch', () => {
  function setup(o: { enabled?: boolean; front?: boolean; paused?: boolean } = {}) {
    let now = 1_000_000;
    const state = {
      enabled: o.enabled ?? true,
      front: o.front ?? false,
      paused: o.paused ?? false,
    };
    const grab = vi.fn(async () => frame(now));
    const w = new ScreenWatch({
      grab,
      enabled: () => state.enabled,
      arcInFront: () => state.front,
      paused: () => state.paused,
      now: () => now,
    });
    return { w, grab, state, tick: (ms: number) => (now += ms) };
  }

  it('keeps the latest picture, never one of ARC itself', async () => {
    const t = setup();
    await t.w.capture();
    t.state.front = true;
    await t.w.capture(); // ARC in front: skipped
    expect(t.grab).toHaveBeenCalledTimes(1);
    t.tick(30_000);
    const shot = await t.w.forModel();
    expect(shot).toMatchObject({ ageSec: 30, arcVisible: false });
    expect(t.grab).toHaveBeenCalledTimes(1);
  });

  it('grabs a fresh one when the last is old, and nothing when off', async () => {
    const t = setup();
    await t.w.capture();
    t.tick(5 * 60_000);
    expect((await t.w.forModel())?.ageSec).toBe(0);
    expect(t.grab).toHaveBeenCalledTimes(2);
    t.state.enabled = false;
    expect(await t.w.forModel()).toBeNull();
    await t.w.capture();
    expect(t.grab).toHaveBeenCalledTimes(2);
  });
});

describe('look_at_screen', () => {
  it('sends the picture to Claude as an image', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const script = [
      {
        content: [{ type: 'tool_use', id: 't1', name: 'look_at_screen', input: {} }],
        stop_reason: 'tool_use',
      },
      { content: [{ type: 'text', text: 'That error means…' }], stop_reason: 'end_turn' },
    ];
    const stream = vi.fn((params: Record<string, unknown>) => {
      calls.push(structuredClone(params));
      const msg = script.shift();
      return { async *[Symbol.asyncIterator]() {}, finalMessage: async () => msg };
    });
    const p = new AnthropicProvider({
      getKey: async () => 'sk-ant-x',
      model: () => 'claude-haiku-5-5',
      systemPrompt: () => '',
      info: () => null,
      stats: snapshot,
      apps: () => [],
      screenshot: async () => ({ frame: frame(0), ageSec: 3, arcVisible: false }),
      createClient: () =>
        ({ beta: { messages: { stream } }, models: {} }) as unknown as Pick<
          Anthropic,
          'beta' | 'models'
        >,
    });
    const out: Array<Record<string, unknown>> = [];
    for await (const c of p.send([{ role: 'user', content: "what's this error?" }], {
      systemPrompt: '',
    }))
      out.push(c as Record<string, unknown>);
    expect(out).toContainEqual({ type: 'activity', text: 'Looking at your screen…' });
    const result = (calls[1]!['messages'] as Array<{ content: unknown }>).at(-1)!.content as Array<{
      content: Array<Record<string, unknown>>;
    }>;
    expect(result[0]!.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringMatching(/captured 3 seconds ago/),
    });
    expect(result[0]!.content[1]).toEqual({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: Buffer.from('jpegbytes').toString('base64'),
      },
    });
  });
});
