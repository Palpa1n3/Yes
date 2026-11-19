/** Offline AI: a language model running on this PC through Ollama (ollama.com).
 *  Plain conversation only (no actions beyond ARC's own commands); nothing leaves the PC. */
import type { ChatMessage, ProviderChunk } from '@shared/types';
import { OfflineError } from './anthropic-provider';
import type { AIProvider, SendOptions } from './ai-provider';

export const OLLAMA_URL = 'http://127.0.0.1:11434';

type Fetch = typeof fetch;

/** Installed local models (names like "llama3.2:latest"); null if Ollama isn't running. */
export async function localModels(f: Fetch = fetch): Promise<string[] | null> {
  try {
    const r = await f(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return null;
    const j = (await r.json()) as { models?: Array<{ name?: unknown }> };
    return (j.models ?? []).map((m) => String(m.name ?? '')).filter(Boolean);
  } catch {
    return null;
  }
}

export class OllamaProvider implements AIProvider {
  id = 'ollama';

  constructor(
    private readonly d: {
      model(): string;
      /** Extra context: time, memories, a short system summary. */
      context(): string;
      fetch?: Fetch;
    },
  ) {}

  async *send(messages: ChatMessage[], opts: SendOptions): AsyncIterable<ProviderChunk> {
    const f = this.d.fetch ?? fetch;
    const system = `${opts.systemPrompt}

You are running fully offline on the user's own PC (a local model through Ollama), so you have no web access and cannot take actions yourself. The app already handles direct commands like "open Spotify", "set a timer for 10 minutes", "pause music" or "open notes", so if the user wants one of those, tell them the exact phrase to say. Keep answers short and conversational.
${this.d.context()}`;
    let res: Response;
    try {
      res = await f(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.d.model(),
          stream: true,
          messages: [
            { role: 'system', content: system },
            ...messages.filter((m) => m.role !== 'system'),
          ],
        }),
        signal: opts.signal,
      });
    } catch (err) {
      if (opts.signal?.aborted) return;
      throw new OfflineError(
        `The local AI (Ollama) isn't running${err instanceof Error ? '' : ''}. Start Ollama, or switch to Claude.`,
      );
    }
    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => '');
      throw new Error(
        /not found/i.test(t)
          ? `The local model "${this.d.model()}" isn't installed. In a terminal run: ollama pull ${this.d.model()}`
          : `The local AI failed (${res.status}).`,
      );
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let j: { message?: { content?: string }; done?: boolean; error?: string };
        try {
          j = JSON.parse(line) as typeof j;
        } catch {
          continue;
        }
        if (j.error) throw new Error(`Local AI: ${j.error}`);
        if (j.message?.content) yield { type: 'text', delta: j.message.content };
      }
    }
    if (!opts.signal?.aborted) yield { type: 'done' };
  }
}
