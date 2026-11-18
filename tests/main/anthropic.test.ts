import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import type { AiModel, ProviderChunk, ToolOutcome } from '@shared/types';
import {
  AnthropicProvider,
  MAX_STEPS,
  OfflineError,
  describeError,
  repairTranscript,
  toIntent,
} from '../../src/main/services/anthropic-provider';
import { SecretStore, type Encryptor } from '../../src/main/services/secret-store';
import { snapshot } from '../../src/main/services/system-stats';

type Final = { content: unknown[]; stop_reason: string };

/** A fake client: each stream() call plays the next scripted message. */
function fakeClient(script: Final[]) {
  const calls: Array<Record<string, unknown>> = [];
  const stream = vi.fn((params: Record<string, unknown>) => {
    calls.push(structuredClone(params));
    const msg = script.shift();
    if (!msg) throw new Error('script exhausted');
    const texts = msg.content.filter((b) => (b as { type: string }).type === 'text') as Array<{
      text: string;
    }>;
    return {
      async *[Symbol.asyncIterator]() {
        for (const t of texts)
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: t.text } };
      },
      finalMessage: async () => msg,
    };
  });
  const client = {
    beta: { messages: { stream } },
    models: { retrieve: vi.fn(async (id: string) => ({ id, display_name: 'Claude Haiku 5.5' })) },
  };
  return { client: client as unknown as Pick<Anthropic, 'beta' | 'models'>, calls, stream };
}

function provider(
  script: Final[],
  model: AiModel = 'claude-haiku-5-5',
  key: string | null = 'sk-ant-test',
) {
  const f = fakeClient(script);
  const p = new AnthropicProvider({
    getKey: async () => key,
    model: () => model,
    systemPrompt: () => 'You are ARC.',
    info: () => null,
    stats: snapshot,
    apps: () => [{ name: 'Spotify', intents: ['play music'] }],
    createClient: () => f.client,
  });
  return { p, ...f };
}

async function collect(
  p: AnthropicProvider,
  text: string,
  runTool?: (id: string) => Promise<ToolOutcome>,
): Promise<ProviderChunk[]> {
  const out: ProviderChunk[] = [];
  for await (const c of p.send([{ role: 'user', content: text }], { systemPrompt: '', runTool }))
    out.push(c);
  return out;
}

const text = (t: string) => ({ type: 'text', text: t });
const toolUse = (id: string, name: string, input: unknown) => ({
  type: 'tool_use',
  id,
  name,
  input,
});

describe('AnthropicProvider', () => {
  it('streams a plain reply and keeps the conversation', async () => {
    const { p, calls } = provider([
      { content: [text('Hello, sir.')], stop_reason: 'end_turn' },
      { content: [text('Still here.')], stop_reason: 'end_turn' },
    ]);
    expect(await collect(p, 'hi')).toEqual([
      { type: 'text', delta: 'Hello, sir.' },
      { type: 'done' },
    ]);
    await collect(p, 'you there?');
    const msgs = calls[1]!['messages'] as Array<{ role: string }>;
    expect(msgs.map((m) => m.role)).toEqual(['user', 'system', 'assistant', 'user', 'system']);
    expect(calls[0]).toMatchObject({ model: 'claude-haiku-5-5', output_config: { effort: 'low' } });
    expect(calls[0]!['fallbacks']).toBeUndefined(); // Haiku: no server-side fallback
    expect((calls[0]!['system'] as Array<{ cache_control: unknown }>)[0]!.cache_control).toEqual({
      type: 'ephemeral',
    });
  });

  it('turns tool calls into ARC actions and returns their outcome to the model', async () => {
    const { p, calls } = provider([
      {
        content: [text('Opening Spotify.'), toolUse('tu1', 'launch_app', { app: 'spotify' })],
        stop_reason: 'tool_use',
      },
      { content: [text('Done.')], stop_reason: 'end_turn' },
    ]);
    const runTool = vi.fn(async () => ({ status: 'success' as const, message: 'Opened Spotify.' }));
    const chunks = await collect(p, 'open spotify', runTool);
    expect(chunks).toContainEqual({
      type: 'intent',
      intent: { action: 'launch_app', target: 'spotify' },
      toolUseId: 'tu1',
    });
    expect(runTool).toHaveBeenCalledWith('tu1', { action: 'launch_app', target: 'spotify' });
    const last = (calls[1]!['messages'] as Array<{ role: string; content: unknown }>).at(-1)!;
    expect(last).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tu1',
          content: 'success: Opened Spotify.',
          is_error: false,
        },
      ],
    });
    expect(chunks.at(-1)).toEqual({ type: 'done' });
  });

  it('a cancelled action is reported as such, not as an error', async () => {
    const { p, calls } = provider([
      { content: [toolUse('tu1', 'search_web', { query: 'flights' })], stop_reason: 'tool_use' },
      { content: [text('No problem.')], stop_reason: 'end_turn' },
    ]);
    await collect(p, 'search flights', async () => ({
      status: 'cancelled',
      message: 'The user cancelled this action.',
    }));
    const res = (
      (calls[1]!['messages'] as Array<{ content: unknown }>).at(-1)!.content as Array<
        Record<string, unknown>
      >
    )[0];
    expect(res).toMatchObject({
      content: 'cancelled: The user cancelled this action.',
      is_error: false,
    });
  });

  it('uses detailed stats (with processes) for get_system_status when available', async () => {
    const f = fakeClient([
      { content: [toolUse('b', 'get_system_status', {})], stop_reason: 'tool_use' },
      { content: [text('Chrome is busy.')], stop_reason: 'end_turn' },
    ]);
    const detailed = vi.fn(async () => ({
      ...snapshot(),
      processes: [{ pid: 1, name: 'chrome.exe', cpu: 31, mem: 2 * 1024 ** 3 }],
    }));
    const p = new AnthropicProvider({
      getKey: async () => 'k',
      model: () => 'claude-haiku-5-5',
      systemPrompt: () => '',
      info: () => null,
      stats: snapshot,
      detailedStats: detailed,
      apps: () => [],
      createClient: () => f.client,
    });
    await collect(p, 'what is using my cpu', async () => ({ status: 'success', message: 'ok' }));
    const result = (
      (f.calls[1]!['messages'] as Array<{ content: unknown }>).at(-1)!.content as Array<{
        content: string;
      }>
    )[0]!;
    expect(JSON.parse(result.content).topProcesses).toEqual([
      { name: 'chrome.exe', cpuPct: 31, memGB: 2 },
    ]);
  });

  it('tells the model when the process list timed out, and warms it at turn start', async () => {
    const f = fakeClient([
      { content: [toolUse('b', 'get_system_status', {})], stop_reason: 'tool_use' },
      { content: [text('Try Task Manager.')], stop_reason: 'end_turn' },
    ]);
    const warm = vi.fn();
    const p = new AnthropicProvider({
      getKey: async () => 'k',
      model: () => 'claude-haiku-5-5',
      systemPrompt: () => '',
      info: () => null,
      stats: snapshot,
      detailedStats: async () => ({ ...snapshot(), processesTimedOut: true }),
      warm,
      apps: () => [],
      createClient: () => f.client,
    });
    await collect(p, 'what is using my cpu', async () => ({ status: 'success', message: 'ok' }));
    expect(warm).toHaveBeenCalledTimes(1);
    const result = (
      (f.calls[1]!['messages'] as Array<{ content: unknown }>).at(-1)!.content as Array<{
        content: string;
      }>
    )[0]!;
    expect(JSON.parse(result.content).topProcesses).toMatch(/took too long/);
  });

  it('answers list_apps locally and returns live stats for get_system_status', async () => {
    const { p, calls } = provider([
      {
        content: [toolUse('a', 'list_apps', {}), toolUse('b', 'get_system_status', {})],
        stop_reason: 'tool_use',
      },
      { content: [text('All fine.')], stop_reason: 'end_turn' },
    ]);
    const runTool = vi.fn(async () => ({ status: 'success' as const, message: 'ok' }));
    const chunks = await collect(p, 'status?', runTool);
    expect(runTool).toHaveBeenCalledTimes(1); // only the system query shows a card
    expect(chunks.filter((c) => c.type === 'intent')).toHaveLength(1);
    const results = (calls[1]!['messages'] as Array<{ content: unknown }>).at(-1)!
      .content as Array<{ content: string }>;
    expect(JSON.parse(results[0]!.content)).toEqual([{ name: 'Spotify', intents: ['play music'] }]);
    expect(JSON.parse(results[1]!.content)).toHaveProperty('cpu.loadPct');
  });

  it('rejects malformed tool input without running anything', async () => {
    const { p, calls } = provider([
      {
        content: [toolUse('x', 'launch_app', {}), toolUse('y', 'format_disk', { drive: 'C:' })],
        stop_reason: 'tool_use',
      },
      { content: [text('Sorry.')], stop_reason: 'end_turn' },
    ]);
    const runTool = vi.fn();
    await collect(p, 'go', runTool);
    expect(runTool).not.toHaveBeenCalled();
    const results = (calls[1]!['messages'] as Array<{ content: unknown }>).at(-1)!
      .content as Array<{ is_error: boolean; content: string }>;
    expect(results.map((r) => [r.is_error, r.content])).toEqual([
      [true, 'Missing "app".'],
      [true, 'Unknown tool "format_disk".'],
    ]);
  });

  it('a refusal ends the turn with a message and rolls the transcript back', async () => {
    const { p, calls } = provider([
      { content: [], stop_reason: 'refusal' },
      { content: [text('Hi.')], stop_reason: 'end_turn' },
    ]);
    expect((await collect(p, 'bad')).at(-1)).toMatchObject({ type: 'error' });
    await collect(p, 'hello');
    expect((calls[1]!['messages'] as unknown[]).length).toBe(2); // only the new user + system
  });

  it('caps the number of steps in one reply', async () => {
    const loop = Array.from({ length: MAX_STEPS }, (_, i) => ({
      content: [toolUse(`t${i}`, 'list_apps', {})],
      stop_reason: 'tool_use',
    }));
    const { p, stream } = provider(loop);
    const chunks = await collect(p, 'loop');
    expect(stream).toHaveBeenCalledTimes(MAX_STEPS);
    expect(chunks.at(-1)).toEqual({ type: 'done' });
  });

  it('Sonnet and Opus get the default server-side fallback', async () => {
    const { p, calls } = provider(
      [{ content: [text('ok')], stop_reason: 'end_turn' }],
      'claude-sonnet-5-5',
    );
    await collect(p, 'hi');
    expect(calls[0]).toMatchObject({
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  });

  it('offline becomes OfflineError; other API errors become plain messages; transcript is restored', async () => {
    const { p, stream } = provider([]);
    stream.mockImplementationOnce(() => {
      throw new Anthropic.APIConnectionError({ message: 'ECONNREFUSED' });
    });
    await expect(collect(p, 'hi')).rejects.toBeInstanceOf(OfflineError);
    stream.mockImplementationOnce(() => {
      throw new Anthropic.AuthenticationError(401, {}, 'invalid x-api-key', new Headers());
    });
    await expect(collect(p, 'hi')).rejects.toThrow(/key was rejected/);
    expect(
      describeError(new Anthropic.RateLimitError(429, {}, 'slow down', new Headers())),
    ).toMatch(/limiting/);
  });

  it('refuses to run without a key and tests keys via the Models API (no tokens spent)', async () => {
    const none = provider([], 'claude-haiku-5-5', null);
    await expect(collect(none.p, 'hi')).rejects.toThrow(/No API key/);
    const ok = provider([]);
    expect(await ok.p.test()).toEqual({
      ok: true,
      message: 'Connected. Claude Haiku 5.5 is ready.',
    });
    expect(ok.stream).not.toHaveBeenCalled();
  });

  it('an interrupted action leaves no half-finished turn behind (the reported 400)', async () => {
    const { p, calls } = provider([
      {
        content: [text('Opening Spotify.'), toolUse('tu1', 'launch_app', { app: 'spotify' })],
        stop_reason: 'tool_use',
      },
      { content: [text('CPU is fine.')], stop_reason: 'end_turn' },
    ]);
    // Turn 1: the user sends another message while the action is still running.
    const ctrl = new AbortController();
    const first: ProviderChunk[] = [];
    const runTool = () =>
      new Promise<ToolOutcome>((resolve) => {
        ctrl.abort();
        resolve({ status: 'cancelled', message: 'The user moved on.' });
      });
    for await (const c of p.send([{ role: 'user', content: 'open spotify' }], {
      systemPrompt: '',
      signal: ctrl.signal,
      runTool,
    }))
      first.push(c);
    // Turn 2 must start from a clean history: just the new user + system message.
    await collect(p, 'whats using my cpu right now');
    expect((calls[1]!['messages'] as Array<{ role: string }>).map((m) => m.role)).toEqual([
      'user',
      'system',
    ]);
  });

  it('a caller that stops reading mid-turn also rolls the turn back', async () => {
    const { p, calls } = provider([
      { content: [toolUse('tu1', 'launch_app', { app: 'x' })], stop_reason: 'tool_use' },
      { content: [text('hi')], stop_reason: 'end_turn' },
    ]);
    for await (const c of p.send([{ role: 'user', content: 'go' }], {
      systemPrompt: '',
      runTool: async () => ({ status: 'success', message: 'ok' }),
    })) {
      if (c.type === 'intent') break; // e.g. the window closed
    }
    await collect(p, 'hello');
    expect((calls[1]!['messages'] as unknown[]).length).toBe(2);
  });

  it('repairTranscript cuts from the turn with an unanswered tool call', () => {
    const good = [
      { role: 'user', content: 'a' },
      { role: 'system', content: 't' },
      { role: 'assistant', content: [{ type: 'tool_use', id: '1', name: 'list_apps', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: '1', content: '[]' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
    ] as never[];
    expect(repairTranscript(good)).toBe(good);
    const broken = [
      ...good,
      { role: 'user', content: 'b' },
      { role: 'system', content: 't' },
      { role: 'assistant', content: [{ type: 'tool_use', id: '2', name: 'list_apps', input: {} }] },
      { role: 'user', content: 'c' },
    ] as never[];
    expect(repairTranscript(broken)).toEqual(good);
    const strandedSystem = [
      { role: 'user', content: 'a' },
      { role: 'system', content: 't' },
      { role: 'user', content: 'b' },
    ] as never[];
    expect(repairTranscript(strandedSystem)).toEqual([{ role: 'user', content: 'a' }]);
  });

  it('shows the API message for a 400, not the raw JSON', () => {
    const err = new Anthropic.BadRequestError(
      400,
      {
        type: 'error',
        error: { type: 'invalid_request_error', message: 'Your credit balance is too low.' },
      },
      'raw',
      new Headers(),
    );
    expect(describeError(err)).toBe(
      'Anthropic rejected the request: Your credit balance is too low. (If your credit has run out, top up at console.anthropic.com.)',
    );
  });

  it('toIntent validates and trims inputs', () => {
    expect(toIntent('open_url', { url: '  github.com ' })).toEqual({
      intent: { action: 'open_url', target: 'github.com' },
    });
    expect(toIntent('search_web', { query: 42 })).toEqual({ error: 'Missing "query".' });
  });
});

describe('SecretStore', () => {
  const fakeCrypto = (available = true): Encryptor => ({
    isAsyncEncryptionAvailable: async () => available,
    encryptStringAsync: async (s) => Buffer.from(`enc:${Buffer.from(s).toString('base64')}`),
    decryptStringAsync: async (b) => ({
      result: Buffer.from(b.toString().slice(4), 'base64').toString(),
      shouldReEncrypt: false,
    }),
  });

  it('stores encrypted, reads back, and clears', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'arc-key-')), 'key.bin');
    const s = new SecretStore(file, fakeCrypto());
    expect(await s.get()).toBeNull();
    await s.set('sk-ant-secret');
    const reopened = new SecretStore(file, fakeCrypto());
    expect(reopened.has()).toBe(true);
    expect(await reopened.get()).toBe('sk-ant-secret');
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(file, 'utf8')).not.toContain('sk-ant-secret');
    reopened.clear();
    expect(reopened.has()).toBe(false);
  });

  it('will not store a key without OS encryption', async () => {
    const s = new SecretStore(
      join(mkdtempSync(join(tmpdir(), 'arc-key-')), 'k.bin'),
      fakeCrypto(false),
    );
    await expect(s.set('sk-ant-x')).rejects.toThrow(/cannot encrypt/);
  });
});
