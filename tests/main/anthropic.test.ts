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
  statsForModel,
  stripThinking,
  toIntent,
} from '../../src/main/services/anthropic-provider';
import type { WeatherData } from '@shared/weather';
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

  it('answers get_weather locally, or explains when no town is set', async () => {
    for (const weather of [null, WX]) {
      const f = fakeClient([
        { content: [toolUse('w', 'get_weather', {})], stop_reason: 'tool_use' },
        { content: [text('Rainy.')], stop_reason: 'end_turn' },
      ]);
      const p = new AnthropicProvider({
        getKey: async () => 'sk-ant-test',
        model: () => 'claude-haiku-5-5',
        systemPrompt: () => '',
        info: () => null,
        stats: snapshot,
        apps: () => [],
        weather: () => weather,
        createClient: () => f.client,
      });
      const runTool = vi.fn();
      await collect(p, 'weather?', runTool);
      expect(runTool).not.toHaveBeenCalled();
      const r = (f.calls[1]!['messages'] as Array<{ content: unknown }>).at(-1)!.content as Array<{
        is_error?: boolean;
        content: string;
      }>;
      if (weather) expect(JSON.parse(r[0]!.content).now.temp).toBe('8°C');
      else
        expect(r[0]).toMatchObject({ is_error: true, content: expect.stringMatching(/Settings/) });
    }
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
      betas: ['thinking-binding-controls-2026-08-01', 'server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  });

  it('gives Claude the local date and time every turn and in system status', async () => {
    const { p, calls } = provider([{ content: [text('ok')], stop_reason: 'end_turn' }]);
    await collect(p, 'what time is it?');
    const msgs = calls[0]!['messages'] as Array<{ role: string; content: unknown }>;
    const year = String(new Date().getFullYear());
    expect(String(msgs.at(-1)?.content)).toMatch(/Current local date and time .*\d{2}:\d{2}/);
    expect(String(msgs.at(-1)?.content)).toContain(year);
    expect((calls[0]!['system'] as Array<{ text: string }>)[0]!.text).toMatch(
      /answer questions about the time, date or day directly/,
    );
    expect(String(statsForModel(snapshot())['localTime'])).toContain(year);
  });

  it('asks the API to drop stale thinking instead of failing', async () => {
    const { p, calls } = provider([{ content: [text('ok')], stop_reason: 'end_turn' }]);
    await collect(p, 'hi');
    expect(calls[0]).toMatchObject({
      thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
      betas: ['thinking-binding-controls-2026-08-01'],
    });
    expect(calls[0]).not.toHaveProperty('fallbacks'); // Haiku has none
  });

  it('keeps the system prompt fixed in a conversation and appends changes instead', async () => {
    let persona = 'You are ARC.';
    const f = fakeClient([
      {
        content: [{ type: 'thinking', thinking: '', signature: 'sig1' }, text('One.')],
        stop_reason: 'end_turn',
      },
      { content: [text('Two.')], stop_reason: 'end_turn' },
      { content: [text('Three.')], stop_reason: 'end_turn' },
      { content: [text('Fresh.')], stop_reason: 'end_turn' },
    ]);
    const p = new AnthropicProvider({
      getKey: async () => 'sk-ant-test',
      model: () => 'claude-haiku-5-5',
      systemPrompt: () => persona,
      info: () => null,
      stats: snapshot,
      apps: () => [],
      createClient: () => f.client,
    });
    const sys = (i: number): string => (f.calls[i]!['system'] as Array<{ text: string }>)[0]!.text;
    const lastSystemMsg = (i: number): string => {
      const msgs = f.calls[i]!['messages'] as Array<{ role: string; content: unknown }>;
      return String(msgs.filter((m) => m.role === 'system').at(-1)?.content);
    };
    await collect(p, 'one');
    persona = 'You are JARVIS, very formal.';
    await collect(p, 'two');
    await collect(p, 'three');
    expect(sys(1)).toBe(sys(0)); // byte-identical: earlier thinking stays valid
    expect(sys(0)).toMatch(/^You are ARC\./);
    expect(lastSystemMsg(1)).toMatch(/instructions have been updated[\s\S]*You are JARVIS/);
    expect(lastSystemMsg(2)).not.toMatch(/updated/); // said once
    // History before the change is untouched (append-only).
    const before = JSON.stringify((f.calls[0]!['messages'] as unknown[]).slice(0, 2));
    expect(JSON.stringify((f.calls[1]!['messages'] as unknown[]).slice(0, 2))).toBe(before);
    p.reset();
    await collect(p, 'four');
    expect(sys(3)).toMatch(/^You are JARVIS/); // a new conversation takes the new prompt
  });

  it('strips thinking and retries once if the API still rejects it', async () => {
    const f = fakeClient([
      {
        content: [{ type: 'thinking', thinking: '', signature: 's' }, text('A.')],
        stop_reason: 'end_turn',
      },
      { content: [text('B.')], stop_reason: 'end_turn' },
    ]);
    const p = new AnthropicProvider({
      getKey: async () => 'sk-ant-test',
      model: () => 'claude-haiku-5-5',
      systemPrompt: () => 'x',
      info: () => null,
      stats: snapshot,
      apps: () => [],
      createClient: () => f.client,
    });
    await collect(p, 'a');
    const real = f.stream.getMockImplementation();
    f.stream.mockImplementationOnce(() => {
      throw new Anthropic.BadRequestError(
        400,
        {
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message:
              'messages.2.content.0: Invalid `signature` in `thinking` block. The block is bound to a different conversation.',
          },
        },
        undefined,
        new Headers(),
      );
    });
    const chunks = await collect(p, 'b');
    expect(chunks.at(-1)).toEqual({ type: 'done' });
    expect(real).toBeDefined();
    const retried = f.calls.at(-1)!['messages'] as Array<{ role: string; content: unknown }>;
    expect(JSON.stringify(retried)).not.toContain('"thinking"');
    expect(JSON.stringify(retried)).toContain('A.');
  });

  it('removes only thinking blocks', () => {
    const out = stripThinking([
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '', signature: 's' },
          { type: 'redacted_thinking', data: 'x' },
          { type: 'text', text: 'Hello' },
          { type: 'tool_use', id: 't', name: 'list_apps', input: {} },
        ],
      },
    ] as never);
    expect(out[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'Hello' },
        { type: 'tool_use', id: 't', name: 'list_apps', input: {} },
      ],
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

const WX: WeatherData = {
  place: { name: 'Leeds', lat: 53.8, lon: -1.5 },
  units: { temp: 'c', wind: 'kmh' },
  fetchedAt: Date.now(),
  current: {
    temp: 8.4,
    feels: 5,
    humidity: 80,
    code: 61,
    isDay: true,
    windSpeed: 14,
    windDir: 225,
    precipitation: 0,
  },
  hourly: [],
  today: { max: 10, min: 3, rainChance: 70, sunrise: null, sunset: null },
  tomorrow: null,
};

describe('outside content can’t unlock risky tools (enforced in main)', () => {
  const setup = (approve: (t: string, d: string) => Promise<boolean>, script: Final[]) => {
    const f = fakeClient(script);
    const post = vi.fn(() => ({ ok: true }));
    const p = new AnthropicProvider({
      getKey: async () => 'k',
      model: () => 'claude-haiku-5-5',
      systemPrompt: () => '',
      info: () => null,
      stats: snapshot,
      apps: () => [],
      createClient: () => f.client,
      extra: { post_to_discord: post },
      approve,
    });
    return { p, f, post };
  };
  const resultsOf = (f: ReturnType<typeof fakeClient>, i: number) =>
    (f.calls[i]!['messages'] as Array<{ content: unknown }>).at(-1)!.content as Array<{
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    }>;

  it('asks before a risky tool once an email has been read, and refuses on “no”', async () => {
    const approve = vi.fn(async () => false);
    const { p, f, post } = setup(approve, [
      {
        content: [toolUse('a', 'get_emails', {}), toolUse('b', 'post_to_discord', { text: 'x' })],
        stop_reason: 'tool_use',
      },
      { content: [text('I did not post it.')], stop_reason: 'end_turn' },
    ]);
    await collect(p, 'check my email');
    expect(approve).toHaveBeenCalledWith(
      'Alton wants to post a message to Discord',
      expect.stringMatching(/content from outside \(email list\)/),
    );
    expect(post).not.toHaveBeenCalled();
    const r = resultsOf(f, 1).find((x) => x.tool_use_id === 'b');
    expect(r).toMatchObject({ is_error: true });
    expect(r?.content).toMatch(/didn't approve/);
  });

  it('goes ahead on “yes”, and doesn’t ask when nothing from outside was read', async () => {
    const approve = vi.fn(async () => true);
    const { p, post } = setup(approve, [
      {
        content: [
          { type: 'server_tool_use', id: 's1', name: 'web_fetch', input: {} },
          toolUse('b', 'post_to_discord', { text: 'x' }),
        ],
        stop_reason: 'tool_use',
      },
      { content: [text('Posted.')], stop_reason: 'end_turn' },
    ]);
    await collect(p, 'post the page summary');
    expect(approve).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);

    const fresh = setup(approve, [
      { content: [toolUse('c', 'post_to_discord', { text: 'y' })], stop_reason: 'tool_use' },
      { content: [text('Posted.')], stop_reason: 'end_turn' },
    ]);
    await collect(fresh.p, 'post hello to discord');
    expect(approve).toHaveBeenCalledTimes(1);
    expect(fresh.post).toHaveBeenCalledTimes(1);
  });

  it('marks an approved action so the window doesn’t ask twice; ordinary ones aren’t asked', async () => {
    const { p } = setup(
      async () => true,
      [
        {
          content: [
            toolUse('a', 'read_email', { uid: 1 }),
            toolUse('b', 'open_url', { url: 'https://example.test' }),
            toolUse('c', 'set_volume', { level: 20 }),
          ],
          stop_reason: 'tool_use',
        },
        { content: [text('Done.')], stop_reason: 'end_turn' },
      ],
    );
    const out = await collect(p, 'open the link in that email', async () => ({
      status: 'success',
      message: 'ok',
    }));
    const intents = out.filter((c) => c.type === 'intent') as Array<{
      intent: { action: string };
      approved?: boolean;
    }>;
    expect(intents.map((i) => [i.intent.action, i.approved ?? false])).toEqual([
      ['open_url', true],
      ['set_volume', false],
    ]);
  });

  it('refuses risky tools after outside content when there is no way to ask', async () => {
    const f = fakeClient([
      {
        content: [
          toolUse('a', 'search_documents', { query: 'x' }),
          toolUse('b', 'forget', { text: 'x' }),
        ],
        stop_reason: 'tool_use',
      },
      { content: [text('ok')], stop_reason: 'end_turn' },
    ]);
    const p = new AnthropicProvider({
      getKey: async () => 'k',
      model: () => 'claude-haiku-5-5',
      systemPrompt: () => '',
      info: () => null,
      stats: snapshot,
      apps: () => [],
      createClient: () => f.client,
    });
    await collect(p, 'find that doc');
    const res = resultsOf(f, 1);
    expect(res.find((r) => r.tool_use_id === 'b')).toMatchObject({ is_error: true });
  });
});
