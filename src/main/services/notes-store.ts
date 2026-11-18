/** userData/notes.json: lists, quick notes and memories. Also answers Claude's note tools. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  MAX_ITEMS,
  MAX_MEMORIES,
  listName,
  matches,
  type ListItem,
  type Memory,
  type Note,
  type NoteList,
  type NotesOp,
  type NotesState,
} from '@shared/notes';

const str = (v: unknown, n = 300): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '';

export class NotesStore {
  private s: NotesState = { lists: [], notes: [], memories: [] };
  private readonly now: () => number;

  constructor(
    private readonly d: { file?: string; now?: () => number; onChange?(s: NotesState): void },
  ) {
    this.now = d.now ?? Date.now;
  }

  private id(p: string): string {
    return `${p}${this.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }

  load(): void {
    try {
      if (!this.d.file || !existsSync(this.d.file)) return;
      const raw = JSON.parse(readFileSync(this.d.file, 'utf8')) as Partial<NotesState>;
      const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
      this.s = {
        lists: arr<NoteList>(raw.lists)
          .filter((l) => l && typeof l.id === 'string' && typeof l.name === 'string')
          .map((l) => ({
            id: l.id,
            name: str(l.name, 40) || 'List',
            items: arr<ListItem>(l.items)
              .filter((i) => i && typeof i.text === 'string')
              .map((i) => ({
                id: String(i.id),
                text: str(i.text, 200),
                done: i.done === true,
                createdAt: Number(i.createdAt) || 0,
              }))
              .slice(0, MAX_ITEMS),
          })),
        notes: arr<Note>(raw.notes).filter((n) => n && typeof n.text === 'string'),
        memories: arr<Memory>(raw.memories)
          .filter((m) => m && typeof m.text === 'string')
          .slice(0, MAX_MEMORIES),
      };
    } catch {
      /* start empty */
    }
  }

  state(): NotesState {
    return structuredClone(this.s);
  }

  /* ── lists ── */
  findList(name: string): NoteList | undefined {
    const n = listName(name).toLowerCase();
    return this.s.lists.find((l) => l.name.toLowerCase() === n || l.id === name);
  }

  addItems(list: string, texts: string[]): NoteList {
    let l = this.findList(list);
    if (!l) {
      l = { id: this.id('l'), name: listName(list), items: [] };
      this.s.lists.push(l);
    }
    for (const raw of texts) {
      const text = str(raw, 200);
      if (!text) continue;
      const existing = l.items.find((i) => i.text.toLowerCase() === text.toLowerCase());
      if (existing) existing.done = false;
      else if (l.items.length < MAX_ITEMS)
        l.items.push({ id: this.id('i'), text, done: false, createdAt: this.now() });
    }
    this.changed();
    return structuredClone(l);
  }

  /** Mark done/undone or remove the item(s) matching `query` in a list (or any list). */
  updateItems(list: string | null, query: string, action: 'done' | 'undone' | 'remove'): string[] {
    const lists = list ? [this.findList(list)].filter((l): l is NoteList => !!l) : this.s.lists;
    const hit: string[] = [];
    for (const l of lists) {
      for (const i of l.items) if (i.id === query || matches(i.text, query)) hit.push(i.text);
      if (action === 'remove')
        l.items = l.items.filter((i) => !(i.id === query || matches(i.text, query)));
      else
        for (const i of l.items)
          if (i.id === query || matches(i.text, query)) i.done = action === 'done';
    }
    if (hit.length) this.changed();
    return hit;
  }

  toggle(listId: string, itemId: string): void {
    const i = this.s.lists.find((l) => l.id === listId)?.items.find((x) => x.id === itemId);
    if (!i) return;
    i.done = !i.done;
    this.changed();
  }

  clearDone(listId: string): void {
    const l = this.s.lists.find((x) => x.id === listId);
    if (!l) return;
    l.items = l.items.filter((i) => !i.done);
    this.changed();
  }

  renameList(listId: string, name: string): void {
    const l = this.s.lists.find((x) => x.id === listId);
    const n = str(name, 40);
    if (!l || !n) return;
    l.name = n;
    this.changed();
  }

  removeList(listId: string): void {
    this.s.lists = this.s.lists.filter((l) => l.id !== listId);
    this.changed();
  }

  /* ── notes ── */
  addNote(text: string): Note | null {
    const t = typeof text === 'string' ? text.trim().slice(0, 2000) : '';
    if (!t) return null;
    const n = { id: this.id('n'), text: t, createdAt: this.now() };
    this.s.notes.unshift(n);
    this.changed();
    return n;
  }

  removeNote(id: string): void {
    this.s.notes = this.s.notes.filter((n) => n.id !== id);
    this.changed();
  }

  /* ── memories ── */
  remember(text: string): Memory | null {
    const t = str(text, 300);
    if (!t) return null;
    const dupe = this.s.memories.find((m) => m.text.toLowerCase() === t.toLowerCase());
    if (dupe) return dupe;
    const m = { id: this.id('m'), text: t, createdAt: this.now() };
    this.s.memories.push(m);
    if (this.s.memories.length > MAX_MEMORIES) this.s.memories.shift();
    this.changed();
    return m;
  }

  /** Forget memories matching the words (or by id); returns what was forgotten. */
  forget(query: string): string[] {
    const gone = this.s.memories.filter((m) => m.id === query || matches(m.text, query));
    if (!gone.length) return [];
    this.s.memories = this.s.memories.filter((m) => !gone.includes(m));
    this.changed();
    return gone.map((m) => m.text);
  }

  memoryTexts(): string[] {
    return this.s.memories.map((m) => m.text);
  }

  /** Apply an edit from the Notes tab. */
  apply(o: NotesOp): NotesState {
    switch (o.op) {
      case 'addItems':
        this.addItems(
          str(o.list, 60) || 'To-do',
          Array.isArray(o.items) ? o.items.map(String) : [],
        );
        break;
      case 'toggle':
        this.toggle(String(o.listId), String(o.itemId));
        break;
      case 'removeItem': {
        const l = this.s.lists.find((x) => x.id === o.listId);
        if (l) {
          l.items = l.items.filter((i) => i.id !== o.itemId);
          this.changed();
        }
        break;
      }
      case 'clearDone':
        this.clearDone(String(o.listId));
        break;
      case 'renameList':
        this.renameList(String(o.listId), String(o.name));
        break;
      case 'removeList':
        this.removeList(String(o.listId));
        break;
      case 'addNote':
        this.addNote(String(o.text));
        break;
      case 'removeNote':
        this.removeNote(String(o.id));
        break;
      case 'remember':
        this.remember(String(o.text));
        break;
      case 'forget':
        this.forget(String(o.id));
        break;
    }
    return this.state();
  }

  /** Claude's note tools. Returns a JSON-able result or { error }. */
  tool(name: string, input: unknown): unknown {
    const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    switch (name) {
      case 'add_to_list': {
        const items = Array.isArray(o['items'])
          ? o['items'].map((x) => str(x, 200)).filter(Boolean)
          : [];
        if (!items.length) return { error: 'Missing "items".' };
        const l = this.addItems(str(o['list'], 60) || 'To-do', items);
        return { list: l.name, items: l.items.filter((i) => !i.done).map((i) => i.text) };
      }
      case 'get_lists':
        return this.s.lists.map((l) => ({
          list: l.name,
          toDo: l.items.filter((i) => !i.done).map((i) => i.text),
          done: l.items.filter((i) => i.done).map((i) => i.text),
        }));
      case 'update_list_item': {
        const action =
          o['action'] === 'remove' ? 'remove' : o['action'] === 'undone' ? 'undone' : 'done';
        const item = str(o['item'], 200);
        if (!item) return { error: 'Missing "item".' };
        const hit = this.updateItems(str(o['list'], 60) || null, item, action);
        return hit.length
          ? {
              [action === 'remove' ? 'removed' : action === 'done' ? 'tickedOff' : 'reopened']: hit,
            }
          : { error: `No list item matching "${item}".` };
      }
      case 'add_note': {
        const n = this.addNote(String(o['text'] ?? ''));
        return n ? { saved: n.text } : { error: 'Missing "text".' };
      }
      case 'get_notes':
        return this.s.notes
          .slice(0, 50)
          .map((n) => ({ text: n.text, saved: new Date(n.createdAt).toLocaleString() }));
      case 'remember': {
        const m = this.remember(String(o['fact'] ?? ''));
        return m ? { remembered: m.text } : { error: 'Missing "fact".' };
      }
      case 'forget': {
        const gone = this.forget(str(o['about'], 200));
        return gone.length ? { forgotten: gone } : { error: 'Nothing remembered matches that.' };
      }
      default:
        return { error: `Unknown tool ${name}.` };
    }
  }

  private changed(): void {
    if (this.d.file)
      try {
        mkdirSync(dirname(this.d.file), { recursive: true });
        writeFileSync(`${this.d.file}.tmp`, JSON.stringify(this.s, null, 1));
        renameSync(`${this.d.file}.tmp`, this.d.file);
      } catch {
        /* not fatal */
      }
    this.d.onChange?.(this.state());
  }
}

export const NOTE_TOOLS = [
  'add_to_list',
  'get_lists',
  'update_list_item',
  'add_note',
  'get_notes',
  'remember',
  'forget',
] as const;
