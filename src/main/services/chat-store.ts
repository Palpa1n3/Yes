/** Saved chats: userData/chats/index.json (titles, order, active chat) plus one
 *  messages file per chat. When "Remember conversations" is off nothing is written. */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_CHAT_MESSAGES,
  NEW_CHAT_TITLE,
  titleFrom,
  type ChatMeta,
  type ChatsState,
} from '@shared/chats';
import type { StoredMessage } from '@shared/types';
import { settleMessages, validMessage } from './history-store';

export interface ChatStoreDeps {
  dir: string;
  /** Old single-conversation history to move into the first chat. */
  legacyHistory?: string;
  persist(): boolean;
  now?: () => number;
  onChange?(s: ChatsState): void;
}

const ID = /^c[a-z0-9]{6,24}$/;

export class ChatStore {
  private chats: ChatMeta[] = [];
  private activeId = '';
  private memory = new Map<string, StoredMessage[]>();
  private readonly now: () => number;

  constructor(private readonly d: ChatStoreDeps) {
    this.now = d.now ?? Date.now;
  }

  private file(id: string): string {
    return join(this.d.dir, `${id}.json`);
  }

  private newId(): string {
    return `c${this.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  load(): void {
    try {
      const raw = JSON.parse(
        readFileSync(join(this.d.dir, 'index.json'), 'utf8'),
      ) as Partial<ChatsState>;
      this.chats = (Array.isArray(raw.chats) ? raw.chats : [])
        .filter(
          (c): c is ChatMeta =>
            !!c && typeof c.id === 'string' && ID.test(c.id) && typeof c.title === 'string',
        )
        .map((c) => ({
          id: c.id,
          title: c.title.slice(0, 80) || NEW_CHAT_TITLE,
          createdAt: Number(c.createdAt) || this.now(),
          updatedAt: Number(c.updatedAt) || this.now(),
          pinned: c.pinned === true,
          research: c.research === true,
        }));
      this.activeId = typeof raw.activeId === 'string' ? raw.activeId : '';
    } catch {
      this.chats = [];
    }
    // First run after the update: the old conversation becomes the first chat.
    if (!this.chats.length && this.d.legacyHistory && existsSync(this.d.legacyHistory)) {
      try {
        const old = (JSON.parse(readFileSync(this.d.legacyHistory, 'utf8')) as unknown[]).filter(
          validMessage,
        );
        if (old.length) {
          const first = old.find((m) => m.role === 'user');
          const meta = this.add(
            first && first.role === 'user' ? titleFrom(first.text) : 'Earlier chat',
          );
          meta.createdAt = old[0]?.timestamp ?? meta.createdAt;
          meta.updatedAt = old.at(-1)?.timestamp ?? meta.updatedAt;
          this.write(meta.id, old);
        }
        rmSync(this.d.legacyHistory, { force: true });
      } catch {
        /* ignore an unreadable old file */
      }
    }
    if (!this.chats.some((c) => c.id === this.activeId))
      this.activeId = this.sorted()[0]?.id ?? this.add().id;
    this.saveIndex();
  }

  private sorted(): ChatMeta[] {
    return [...this.chats].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  state(): ChatsState {
    return { activeId: this.activeId, chats: this.sorted().map((c) => ({ ...c })) };
  }

  get(id: string): ChatMeta | undefined {
    return this.chats.find((c) => c.id === id);
  }

  private add(title = NEW_CHAT_TITLE): ChatMeta {
    const t = this.now();
    const meta: ChatMeta = {
      id: this.newId(),
      title,
      createdAt: t,
      updatedAt: t,
      pinned: false,
      research: false,
    };
    this.chats.push(meta);
    this.activeId = meta.id;
    return meta;
  }

  /** A new empty chat (reuses an existing empty one rather than piling them up). */
  create(research = false): ChatMeta {
    const empty = this.chats.find((c) => c.title === NEW_CHAT_TITLE && !this.messages(c.id).length);
    const meta = empty ?? this.add();
    meta.research = research;
    meta.updatedAt = this.now();
    this.activeId = meta.id;
    this.changed();
    return { ...meta };
  }

  open(id: string): StoredMessage[] {
    if (!this.get(id)) throw new Error('That chat no longer exists.');
    this.activeId = id;
    this.changed();
    return this.messages(id);
  }

  messages(id: string): StoredMessage[] {
    const mem = this.memory.get(id);
    if (mem) return mem;
    try {
      const raw: unknown = JSON.parse(readFileSync(this.file(id), 'utf8'));
      return Array.isArray(raw) ? raw.filter(validMessage) : [];
    } catch {
      return [];
    }
  }

  save(id: string, messages: StoredMessage[]): void {
    const meta = this.get(id);
    if (!meta) return;
    const settled = settleMessages(messages).slice(-MAX_CHAT_MESSAGES);
    const before = this.messages(id);
    this.write(id, settled);
    const firstUser = settled.find((m) => m.role === 'user');
    let changed = false;
    if (meta.title === NEW_CHAT_TITLE && firstUser && firstUser.role === 'user') {
      meta.title = titleFrom(firstUser.text);
      changed = true;
    }
    // Only real conversation moves a chat to the top (not greetings or notices).
    const real = (ms: StoredMessage[]): number =>
      ms.filter((m) => m.role === 'user' || m.role === 'command').length;
    if (real(settled) !== real(before)) {
      meta.updatedAt = this.now();
      changed = true;
    }
    if (changed) this.changed();
  }

  rename(id: string, title: string): void {
    const meta = this.get(id);
    const t = title.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!meta || !t) return;
    meta.title = t;
    this.changed();
  }

  setPinned(id: string, pinned: boolean): void {
    const meta = this.get(id);
    if (!meta) return;
    meta.pinned = pinned;
    this.changed();
  }

  setResearch(id: string, research: boolean): void {
    const meta = this.get(id);
    if (!meta) return;
    meta.research = research;
    this.changed();
  }

  remove(id: string): ChatsState {
    this.chats = this.chats.filter((c) => c.id !== id);
    this.memory.delete(id);
    rmSync(this.file(id), { force: true });
    if (this.activeId === id) this.activeId = this.sorted()[0]?.id ?? this.add().id;
    this.changed();
    return this.state();
  }

  /** Chats whose title or messages contain the words. */
  search(query: string): string[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return this.chats.map((c) => c.id);
    return this.sorted()
      .filter((c) => {
        const hay = `${c.title}\n${this.messages(c.id)
          .map((m) => (m.role === 'user' || m.role === 'assistant' ? m.text : ''))
          .join('\n')}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .map((c) => c.id);
  }

  /** "Remember conversations" switched off: forget everything on disk. */
  wipeDisk(): void {
    rmSync(this.d.dir, { recursive: true, force: true });
  }

  private write(id: string, messages: StoredMessage[]): void {
    if (!this.d.persist()) {
      this.memory.set(id, messages);
      return;
    }
    this.memory.delete(id);
    try {
      mkdirSync(this.d.dir, { recursive: true });
      const tmp = `${this.file(id)}.tmp`;
      writeFileSync(tmp, JSON.stringify(messages));
      renameSync(tmp, this.file(id));
    } catch {
      this.memory.set(id, messages);
    }
  }

  private changed(): void {
    this.saveIndex();
    this.d.onChange?.(this.state());
  }

  private saveIndex(): void {
    if (!this.d.persist()) return;
    try {
      mkdirSync(this.d.dir, { recursive: true });
      const f = join(this.d.dir, 'index.json');
      writeFileSync(`${f}.tmp`, JSON.stringify(this.state()));
      renameSync(`${f}.tmp`, f);
    } catch {
      /* not fatal */
    }
  }
}
