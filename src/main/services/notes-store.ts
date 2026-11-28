/** userData/notes.json: lists, quick notes and memories. Also answers Claude's note tools. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  MAX_ITEMS,
  MAX_MEMORIES,
  MEMORY_CATEGORIES,
  listName,
  matches,
  type ListItem,
  type Memory,
  type Goal,
  type MemoryCategory,
  type Note,
  type NoteList,
  type NotesOp,
  type NotesState,
  type ArchivedMemory,
} from '@shared/notes';
import { SAME_THING, planTidy, similarity, tidyCount } from '@shared/memory-tidy';
import { compareChanges, describeMismatch, idChanges, type Change } from '@shared/intended';

const str = (v: unknown, n = 300): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '';

export class NotesStore {
  private s: NotesState = { lists: [], notes: [], memories: [], goals: [] };
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
        memoryArchive: arr<ArchivedMemory>(raw.memoryArchive)
          .filter((m) => m && typeof m.text === 'string' && typeof m.batch === 'string')
          .slice(-200),
        goals: arr<Goal>(raw.goals)
          .filter((g) => g && typeof g.title === 'string')
          .map((g) => ({
            ...g,
            progress: Math.max(0, Math.min(100, Number(g.progress) || 0)),
            log: Array.isArray(g.log) ? g.log.slice(-30) : [],
          }))
          .slice(0, 50),
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
    const t = typeof text === 'string' ? text.trim().slice(0, 8000) : '';
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
  remember(
    text: string,
    learned = false,
    category?: MemoryCategory,
    project?: string,
  ): Memory | null {
    const t = str(text, 300);
    if (!t) return null;
    const dupe = this.s.memories.find((m) => m.text.toLowerCase() === t.toLowerCase());
    if (dupe) return dupe;
    // Saying the same thing as an existing memory: update that one (newest wording) instead of
    // keeping two.
    const same = this.s.memories.find(
      (m) => (m.project ?? '') === (project ?? '') && similarity(m.text, t) >= SAME_THING,
    );
    if (same) {
      same.text = t;
      same.createdAt = this.now();
      this.changed();
      return same;
    }
    const m: Memory = {
      id: this.id('m'),
      text: t,
      createdAt: this.now(),
      ...(learned ? { learned: true } : {}),
      ...(category ? { category } : {}),
      ...(project ? { project: project.slice(0, 40) } : {}),
    };
    this.s.memories.push(m);
    if (this.s.memories.length > MAX_MEMORIES) this.s.memories.shift();
    this.changed();
    return m;
  }

  /** Merge memories that say the same thing and retire ones about a moment that has passed.
   *  What's taken out is archived (undo puts it back). Returns how many of each. */
  tidyMemories(): { merged: number; outOfDate: number; stopped?: string } {
    const plan = planTidy(this.s.memories, this.now());
    if (!tidyCount(plan)) return { merged: 0, outOfDate: 0 };
    // A tidy-up never takes out more than a third of what Alton remembers in one go.
    const total = this.s.memories.length;
    if (tidyCount(plan) > Math.max(3, Math.floor(total / 3)))
      return {
        merged: 0,
        outOfDate: 0,
        stopped: `Memory tidy-up stopped: it planned to take out ${tidyCount(plan)} of ${total} memories, more than it's allowed to at once. Nothing was changed.`,
      };
    const beforeMemories = this.s.memories;
    const beforeIds = beforeMemories.map((m) => m.id);
    const batch = `t${this.now().toString(36)}`;
    const removedAt = this.now();
    const out = new Map<string, ArchivedMemory['why']>();
    for (const g of plan.merges) for (const id of g.drop) out.set(id, 'merged');
    for (const id of plan.outOfDate) out.set(id, 'out of date');
    const archived: ArchivedMemory[] = this.s.memories
      .filter((m) => out.has(m.id))
      .map((m) => ({ ...m, removedAt, why: out.get(m.id) ?? 'merged', batch }));
    this.s.memories = this.s.memories.filter((m) => !out.has(m.id));
    // Check: exactly the planned memories went, and nothing else.
    const intended: Change[] = [...out.keys()].map((target) => ({ target, op: 'delete' }));
    const check = compareChanges(
      intended,
      idChanges(
        beforeIds,
        this.s.memories.map((m) => m.id),
      ),
    );
    if (!check.ok || archived.length !== out.size) {
      this.s.memories = beforeMemories;
      return {
        merged: 0,
        outOfDate: 0,
        stopped: `${describeMismatch('Memory tidy-up', check)} Everything was put back.`,
      };
    }
    this.s.memoryArchive = [...(this.s.memoryArchive ?? []), ...archived].slice(-200);
    this.changed();
    return {
      merged: archived.filter((a) => a.why === 'merged').length,
      outOfDate: archived.filter((a) => a.why === 'out of date').length,
    };
  }

  /** Put back what the last tidy-up took out. Returns how many came back. */
  undoMemoryTidy(): number {
    const arch = this.s.memoryArchive ?? [];
    const last = arch[arch.length - 1]?.batch;
    if (!last) return 0;
    const back = arch.filter((a) => a.batch === last);
    for (const a of back) {
      const m: Memory = {
        id: a.id,
        text: a.text,
        createdAt: a.createdAt,
        ...(a.learned ? { learned: true } : {}),
        ...(a.category ? { category: a.category } : {}),
        ...(a.project ? { project: a.project } : {}),
      };
      if (!this.s.memories.some((x) => x.id === m.id)) this.s.memories.push(m);
    }
    this.s.memoryArchive = arch.filter((a) => a.batch !== last);
    this.changed();
    return back.length;
  }

  /** Forget memories matching the words (or by id); returns what was forgotten. */
  forget(query: string): string[] {
    const gone = this.s.memories.filter((m) => m.id === query || matches(m.text, query));
    if (!gone.length) return [];
    this.s.memories = this.s.memories.filter((m) => !gone.includes(m));
    this.changed();
    return gone.map((m) => m.text);
  }

  /* ── goals ── */
  addGoal(title: string, due?: string): Goal | null {
    const t = str(title, 120);
    if (!t) return null;
    const existing = this.s.goals.find((g) => g.title.toLowerCase() === t.toLowerCase());
    if (existing) return existing;
    const now = this.now();
    const g: Goal = {
      id: this.id('g'),
      title: t,
      progress: 0,
      createdAt: now,
      updatedAt: now,
      log: [],
      ...(due && /^\d{4}-\d{2}-\d{2}$/.test(due) ? { due } : {}),
    };
    this.s.goals.push(g);
    this.changed();
    return g;
  }

  findGoal(q: string): Goal | undefined {
    const l = q.toLowerCase();
    return (
      this.s.goals.find((g) => g.id === q || g.title.toLowerCase() === l) ??
      this.s.goals.find(
        (g) => g.title.toLowerCase().includes(l) || l.includes(g.title.toLowerCase()),
      )
    );
  }

  goalProgress(id: string, progress: number, note?: string): Goal | null {
    const g = this.findGoal(id);
    if (!g) return null;
    if (Number.isFinite(progress)) g.progress = Math.max(0, Math.min(100, Math.round(progress)));
    g.done = g.progress >= 100;
    g.updatedAt = this.now();
    const n = note ? str(note, 200) : '';
    if (n) g.log = [...g.log, { at: g.updatedAt, text: n }].slice(-30);
    this.changed();
    return g;
  }

  /** The open goal that has gone longest without an update (if over 7 days). */
  staleGoal(): { title: string; days: number } | null {
    const open = this.s.goals.filter((g) => !g.done);
    const oldest = open.sort((a, b) => a.updatedAt - b.updatedAt)[0];
    if (!oldest) return null;
    const days = Math.floor((this.now() - oldest.updatedAt) / 86_400_000);
    return days >= 7 ? { title: oldest.title, days } : null;
  }

  memoryTexts(): string[] {
    return this.s.memories.map((m) => (m.project ? `[${m.project}] ${m.text}` : m.text));
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
      case 'tidyMemories':
        this.tidyMemories();
        break;
      case 'undoMemoryTidy':
        this.undoMemoryTidy();
        break;
      case 'editMemory': {
        const m = this.s.memories.find((x) => x.id === o.id);
        const t = str(o.text, 300);
        if (m && t) {
          m.text = t;
          delete m.learned; // checked by the user now
          this.changed();
        }
        break;
      }
      case 'addGoal':
        this.addGoal(String(o.title), o.due);
        break;
      case 'goalProgress':
        this.goalProgress(String(o.id), Number(o.progress), o.note);
        break;
      case 'removeGoal':
        this.s.goals = this.s.goals.filter((g) => g.id !== o.id);
        this.changed();
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
      case 'manage_goal': {
        const action = String(o['action'] ?? 'list');
        if (action === 'list')
          return this.s.goals.map((g) => ({
            goal: g.title,
            progress: `${g.progress}%`,
            ...(g.due ? { due: g.due } : {}),
            lastUpdate: new Date(g.updatedAt).toLocaleDateString(),
            recent: g.log.slice(-3).map((x) => x.text),
          }));
        const title = str(o['goal'], 120);
        if (!title) return { error: 'Missing "goal".' };
        if (action === 'add') {
          const g = this.addGoal(title, typeof o['due'] === 'string' ? o['due'] : undefined);
          return g ? { added: g.title } : { error: 'Could not add that goal.' };
        }
        if (action === 'remove') {
          const g = this.findGoal(title);
          if (!g) return { error: `No goal like "${title}".` };
          this.s.goals = this.s.goals.filter((x) => x !== g);
          this.changed();
          return { removed: g.title };
        }
        const g = this.findGoal(title);
        if (!g) return { error: `No goal like "${title}". Add it first.` };
        const p = typeof o['progress'] === 'number' ? o['progress'] : g.progress;
        const done = this.goalProgress(
          g.id,
          p,
          typeof o['note'] === 'string' ? o['note'] : undefined,
        );
        return { goal: done?.title, progress: `${done?.progress}%` };
      }
      case 'remember': {
        const cat = String(o['category'] ?? '');
        const m = this.remember(
          String(o['fact'] ?? ''),
          false,
          (MEMORY_CATEGORIES as readonly string[]).includes(cat)
            ? (cat as MemoryCategory)
            : undefined,
          typeof o['project'] === 'string' ? o['project'] : undefined,
        );
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
  'manage_goal',
] as const;
