import { describe, expect, it } from 'vitest';
import { canonIntent, toCommand } from '@shared/commands';
import type { ProviderChunk } from '@shared/types';
import { MockProvider } from '../../src/main/services/ai-provider';

async function collect(text: string, signal?: AbortSignal): Promise<ProviderChunk[]> {
  const out: ProviderChunk[] = [];
  for await (const c of new MockProvider().send([{ role: 'user', content: text }], {
    systemPrompt: '',
    signal,
  }))
    out.push(c);
  return out;
}
const textOf = (cs: ProviderChunk[]): string =>
  cs.map((c) => (c.type === 'text' ? c.delta : '')).join('');

describe('MockProvider', () => {
  it('streams text word by word, then an intent, then done', async () => {
    const cs = await collect('open vscode');
    expect(cs.filter((c) => c.type === 'text').length).toBeGreaterThan(2);
    expect(textOf(cs)).toMatch(/Launching Visual Studio Code\./);
    const intent = cs.find((c) => c.type === 'intent');
    expect(intent && intent.type === 'intent' && canonIntent(intent.intent.action)).toBe(
      'launch_app',
    );
    expect(cs.at(-1)?.type).toBe('done');
  });

  it('maps searches and URLs to the right canonical actions', async () => {
    const s = (await collect('search for cheap flights')).find((c) => c.type === 'intent');
    expect(s?.type === 'intent' && toCommand(s.intent, 'x')).toMatchObject({
      action: 'search_web',
      target: 'cheap flights',
    });
    const u = (await collect('go to github.com')).find((c) => c.type === 'intent');
    expect(u?.type === 'intent' && canonIntent(u.intent.action)).toBe('open_url');
  });

  it('streams follow-up text after a system query intent', async () => {
    const cs = await collect("how's my system?");
    const i = cs.findIndex((c) => c.type === 'intent');
    expect(i).toBeGreaterThan(0);
    expect(cs.slice(i + 1).some((c) => c.type === 'text')).toBe(true);
  });

  it('never promises success before a launch has run', async () => {
    const p = new MockProvider();
    for (let turn = 0; turn < 8; turn++) {
      let text = '';
      for await (const c of p.send([{ role: 'user', content: 'open nonexistent app' }], {
        systemPrompt: '',
      })) {
        if (c.type === 'text') text += c.delta;
        if (c.type === 'intent') break; // only what's said before the command runs
      }
      expect(text).not.toMatch(/done|complete|launched/i);
    }
  }, 20_000);

  it('can simulate a failure', async () => {
    const cs = await collect('please break');
    expect(cs.at(-1)?.type).toBe('error');
  });

  it('stops promptly when aborted', async () => {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 50);
    const t0 = Date.now();
    const cs = await collect('tell me a joke', ctrl.signal);
    expect(Date.now() - t0).toBeLessThan(300);
    expect(cs.some((c) => c.type === 'done')).toBe(false);
  });
});

describe('canonIntent (Stage 4 subset; Stage 7 extends)', () => {
  it.each([
    ['open app', 'launch_app'],
    ['Launch Application', 'launch_app'],
    ['start', 'launch_app'],
    ['launch_app', 'launch_app'],
    ['web search', 'search_web'],
    ['open website', 'open_url'],
    ['go to', 'open_url'],
    ['system status', 'system_query'],
    ['make me a sandwich', 'unknown'],
    ['', 'unknown'],
  ])('%s -> %s', (raw, expected) => expect(canonIntent(raw)).toBe(expected));
});
