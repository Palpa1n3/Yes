/** Builds the personal knowledge graph (shared/knowledge.ts) from Alton's memories with a small,
 *  cheap model, only when the memories have changed, and keeps it in userData/knowledge.json. It's
 *  background work: skipped when the monthly limit pauses it. */
import type Anthropic from '@anthropic-ai/sdk';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import {
  EMPTY_GRAPH,
  ENTITY_KINDS,
  memoriesKey,
  parseGraph,
  type KnowledgeGraph,
} from '@shared/knowledge';

export interface KnowledgeDeps {
  file: string;
  client(): Promise<Pick<Anthropic, 'beta'> | null>;
  memories(): string[];
  /** Why it mustn't run now (switched off, spending limit…), or null. */
  blocked(): string | null;
  onUsage?(model: string, usage: import('@shared/usage').Usage): void;
  log?(text: string): void;
}

const MODEL = 'claude-haiku-5-5';

export class KnowledgeService {
  private graph: KnowledgeGraph = EMPTY_GRAPH;
  private building = false;

  constructor(private readonly d: KnowledgeDeps) {
    try {
      const j = JSON.parse(readFileSync(d.file, 'utf8')) as KnowledgeGraph;
      if (Array.isArray(j.entities) && Array.isArray(j.links)) this.graph = j;
    } catch {
      /* not built yet */
    }
  }

  get(): KnowledgeGraph {
    return this.graph;
  }

  /** Rebuild when the memories have changed (or always, with `force`). */
  async rebuild(force = false): Promise<{ ok: boolean; message: string }> {
    const memories = this.d.memories();
    const key = memoriesKey(memories);
    if (!force && key === this.graph.builtFrom) return { ok: true, message: 'Already up to date.' };
    if (memories.length < 3) return { ok: true, message: 'Not enough memories yet.' };
    const why = this.d.blocked();
    if (why) return { ok: false, message: why };
    if (this.building) return { ok: true, message: 'Already building.' };
    this.building = true;
    try {
      const client = await this.d.client();
      if (!client) return { ok: false, message: 'Needs Claude (an API key).' };
      const res = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 3000,
        tools: [
          {
            name: 'save_graph',
            description: 'Save who and what the user has mentioned, and how they connect.',
            input_schema: {
              type: 'object',
              properties: {
                entities: {
                  type: 'array',
                  maxItems: 60,
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      kind: { type: 'string', enum: ENTITY_KINDS },
                      aliases: { type: 'array', items: { type: 'string' }, maxItems: 5 },
                      notes: { type: 'array', items: { type: 'string' }, maxItems: 6 },
                    },
                    required: ['name', 'kind'],
                    additionalProperties: false,
                  },
                },
                links: {
                  type: 'array',
                  maxItems: 150,
                  items: {
                    type: 'object',
                    properties: {
                      from: { type: 'string' },
                      rel: { type: 'string' },
                      to: { type: 'string' },
                    },
                    required: ['from', 'rel', 'to'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['entities', 'links'],
              additionalProperties: false,
            },
          },
        ],
        tool_choice: { type: 'tool', name: 'save_graph' },
        messages: [
          {
            role: 'user',
            content: `These are facts an assistant has noted about its user. List the people, places, projects, organisations, things (e.g. their PC, games, apps they use) and dated events they mention, each with short notes, and the links between them (short verbs like "works at", "partner of", "lives in", "runs on"). Use "user" for the user. Only what the facts say; no guesses, no secrets.\n\n${memories
              .map((m) => `- ${m}`)
              .join('\n')}`,
          },
        ],
      });
      this.d.onUsage?.(MODEL, res.usage);
      const call = res.content.find((b) => b.type === 'tool_use');
      if (!call || call.type !== 'tool_use') throw new Error('no graph in the reply');
      this.graph = parseGraph(call.input, key, Date.now());
      this.save();
      const msg = `Knowledge graph rebuilt: ${this.graph.entities.length - 1} people/places/things, ${this.graph.links.length} links.`;
      this.d.log?.(msg);
      return { ok: true, message: msg };
    } catch (e) {
      const msg = `Couldn’t build the knowledge graph: ${e instanceof Error ? e.message : 'error'}`;
      this.d.log?.(msg);
      return { ok: false, message: msg };
    } finally {
      this.building = false;
    }
  }

  private save(): void {
    try {
      writeFileSync(`${this.d.file}.tmp`, JSON.stringify(this.graph));
      renameSync(`${this.d.file}.tmp`, this.d.file);
    } catch {
      /* not fatal */
    }
  }
}
