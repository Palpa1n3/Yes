/** Learns lasting facts about the user from chats (opt-out: Settings › General).
 *  A few minutes after a chat goes quiet, its new messages are read by a small, cheap model
 *  that lists any new facts worth keeping; they appear in Notes › Memory marked "learned". */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { looksSecret } from '@shared/clipboard';
import type { StoredMessage } from '@shared/types';
import { MEMORY_CATEGORIES, type MemoryCategory } from '@shared/notes';

export interface LearnerDeps {
  client(): Promise<Pick<Anthropic, 'beta'> | null>;
  enabled(): boolean;
  memories(): string[];
  remember(fact: string, category: MemoryCategory): void;
  messages(chatId: string): StoredMessage[];
  /** Where to keep "learned up to" (newest message time) per chat. */
  file?: string;
  delayMs?: number;
  log?(msg: string): void;
  onUsage?(model: string, usage: import('@shared/usage').Usage): void;
}

const MAX_FACTS = 5;

/** Facts the model returned, cleaned and filtered (no secrets, no duplicates). */
export interface Fact {
  text: string;
  category: MemoryCategory;
}

export function cleanFacts(raw: unknown, existing: string[]): Fact[] {
  const list = Array.isArray(raw) ? raw : [];
  const have = new Set(existing.map((e) => e.toLowerCase().trim()));
  const out: Fact[] = [];
  for (const f of list) {
    const o =
      typeof f === 'string'
        ? { text: f }
        : f && typeof f === 'object'
          ? (f as Record<string, unknown>)
          : null;
    if (!o || typeof o.text !== 'string') continue;
    const category = (MEMORY_CATEGORIES as readonly string[]).includes(o.category as string)
      ? (o.category as MemoryCategory)
      : 'other';
    const t = o.text.replace(/\s+/g, ' ').trim().slice(0, 300);
    if (
      t.length < 8 ||
      looksSecret(t) ||
      /\b(password|passcode|pin|card number|sort code)\b/i.test(t)
    )
      continue;
    if (have.has(t.toLowerCase())) continue;
    have.add(t.toLowerCase());
    out.push({ text: t, category });
    if (out.length >= MAX_FACTS) break;
  }
  return out;
}

export class MemoryLearner {
  private upTo: Record<string, number> = {};
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private busy = false;

  constructor(private readonly d: LearnerDeps) {
    try {
      if (d.file && existsSync(d.file)) {
        const raw = JSON.parse(readFileSync(d.file, 'utf8')) as unknown;
        if (raw && typeof raw === 'object') this.upTo = raw as Record<string, number>;
      }
    } catch {
      /* start fresh */
    }
  }

  /** A chat changed: learn from it once it has been quiet for a while. */
  schedule(chatId: string): void {
    if (!this.d.enabled()) return;
    clearTimeout(this.timers.get(chatId));
    this.timers.set(
      chatId,
      setTimeout(
        () => {
          this.timers.delete(chatId);
          void this.learn(chatId);
        },
        this.d.delayMs ?? 3 * 60_000,
      ),
    );
  }

  stop(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  /** Returns the facts saved (exposed for tests). */
  async learn(chatId: string): Promise<Fact[]> {
    if (this.busy || !this.d.enabled()) return [];
    const all = this.d.messages(chatId);
    const since = this.upTo[chatId] ?? 0;
    const fresh = all.filter(
      (m) => (m.role === 'user' || m.role === 'assistant') && m.timestamp > since,
    ) as Array<Extract<StoredMessage, { role: 'user' | 'assistant' }>>;
    const userWords = fresh
      .filter((m) => m.role === 'user')
      .reduce((n, m) => n + m.text.split(/\s+/).length, 0);
    if (userWords < 6) return [];
    const client = await this.d.client();
    if (!client) return [];
    this.busy = true;
    try {
      const transcript = fresh
        .map((m) => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.text.slice(0, 1500)}`)
        .join('\n')
        .slice(-8000);
      const existing = this.d.memories();
      const res = await client.beta.messages.create({
        model: 'claude-haiku-5-5',
        max_tokens: 1024,
        tools: [
          {
            name: 'save_facts',
            description: 'Save lasting facts about the user.',
            input_schema: {
              type: 'object',
              properties: {
                facts: { type: 'array', items: { type: 'string' }, maxItems: MAX_FACTS },
              },
              required: ['facts'],
              additionalProperties: false,
            },
          },
        ],
        tool_choice: { type: 'tool', name: 'save_facts' },
        messages: [
          {
            role: 'user',
            content: `You maintain a personal assistant's long-term memory about its user.

Already remembered:
${existing.length ? existing.map((e) => `- ${e}`).join('\n') : '(nothing yet)'}

Read this conversation excerpt and call save_facts (each with a category: about = who they are, where they live, health they chose to share; people = family, friends, pets; preferences = likes, dislikes, habits; work = job, studies, projects, goals; other) with any NEW facts about the user that will still be true and useful in future conversations: who they are, their job or studies, people and pets in their life (with names), where they live, stable preferences and dislikes, routines, ongoing projects or goals, important dates.

Rules: only facts the USER stated or clearly confirmed (not guesses, not the assistant's suggestions); skip one-off requests and temporary states ("is tired today"); skip anything already remembered; never include passwords, codes, account or card numbers, or health, money or other sensitive details unless the user explicitly asked to remember them. Write each fact as a short sentence like "Their sister is called Amy." Return an empty list if there is nothing new; that is the usual case.

Conversation:
${transcript}`,
          },
        ],
      });
      this.d.onUsage?.('claude-haiku-5-5', res.usage);
      const use = res.content.find((b) => b.type === 'tool_use');
      const facts = cleanFacts(
        use && typeof use.input === 'object' && use.input
          ? (use.input as { facts?: unknown }).facts
          : [],
        existing,
      );
      for (const f of facts) this.d.remember(f.text, f.category);
      this.upTo[chatId] = Math.max(since, ...fresh.map((m) => m.timestamp));
      this.save();
      if (facts.length) this.d.log?.(`learned ${facts.length} fact(s)`);
      return facts;
    } catch (err) {
      this.d.log?.(`memory learning failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    } finally {
      this.busy = false;
    }
  }

  private save(): void {
    if (!this.d.file) return;
    try {
      mkdirSync(dirname(this.d.file), { recursive: true });
      writeFileSync(`${this.d.file}.tmp`, JSON.stringify(this.upTo));
      renameSync(`${this.d.file}.tmp`, this.d.file);
    } catch {
      /* not fatal */
    }
  }
}
