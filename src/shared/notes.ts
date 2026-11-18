/** Lists (shopping, to-do…), quick notes, and things ARC has been asked to remember. */

export interface ListItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

export interface NoteList {
  id: string;
  name: string;
  items: ListItem[];
}

export interface Note {
  id: string;
  text: string;
  createdAt: number;
}

/** A fact the user asked ARC to remember; given to Claude in every chat. */
export interface Memory {
  id: string;
  text: string;
  createdAt: number;
}

export interface NotesState {
  lists: NoteList[];
  notes: Note[];
  memories: Memory[];
}

export const MAX_ITEMS = 200;
export const MAX_MEMORIES = 100;

/** "my Shopping List" → "Shopping"; "to do" / "todo" → "To-do". */
export function listName(raw: string): string {
  const n = raw
    .replace(/\b(my|the)\b/gi, '')
    .replace(/\blist\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^(to[\s-]?do|todo|to-dos?|tasks?)$/i.test(n)) return 'To-do';
  return n ? n.charAt(0).toUpperCase() + n.slice(1, 40) : 'To-do';
}

/** "milk, eggs and bread" → ["milk", "eggs", "bread"]. */
export function splitItems(raw: string): string[] {
  return raw
    .split(/\s*(?:,|;|\band\b|\bplus\b|&)\s*/i)
    .map((s) => s.replace(/^(some|a|an)\s+/i, '').trim())
    .filter(Boolean)
    .map((s) => s.slice(0, 200));
}

/** Words-overlap match used by "tick off milk", "forget the coffee thing". */
export function matches(text: string, query: string): boolean {
  const words = query
    .toLowerCase()
    .replace(/\b(the|a|an|thing|about|that|my|from|off)\b/g, ' ')
    .split(/\W+/)
    .filter((w) => w.length > 1);
  const t = text.toLowerCase();
  return words.length > 0 && words.every((w) => t.includes(w));
}

/** One line for the briefing about the to-do list, if there is anything on it. */
export function todoSentence(s: NotesState): string | null {
  const todo = s.lists.find((l) => l.name === 'To-do');
  const open = todo?.items.filter((i) => !i.done) ?? [];
  if (!open.length) return null;
  const first = open.slice(0, 3).map((i) => i.text);
  return `On your to-do list: ${first.join(', ')}${open.length > 3 ? `, and ${open.length - 3} more` : ''}.`;
}

/** Edits from the Notes tab (one IPC channel, typed by `op`). */
export type NotesOp =
  | { op: 'addItems'; list: string; items: string[] }
  | { op: 'toggle'; listId: string; itemId: string }
  | { op: 'removeItem'; listId: string; itemId: string }
  | { op: 'clearDone'; listId: string }
  | { op: 'renameList'; listId: string; name: string }
  | { op: 'removeList'; listId: string }
  | { op: 'addNote'; text: string }
  | { op: 'removeNote'; id: string }
  | { op: 'remember'; text: string }
  | { op: 'forget'; id: string };
