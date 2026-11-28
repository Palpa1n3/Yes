import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { listName, matches, splitItems, todoSentence } from '@shared/notes';
import type { ProviderChunk } from '@shared/types';
import { MockProvider } from '../../src/main/services/ai-provider';
import { toIntent } from '../../src/main/services/anthropic-provider';
import { NotesStore } from '../../src/main/services/notes-store';

const fresh = (file?: string) => {
  const onChange = vi.fn();
  const s = new NotesStore({ file, onChange });
  s.load();
  return { s, onChange };
};

describe('notes helpers', () => {
  it('normalises list names and splits items', () => {
    expect(listName('my shopping list')).toBe('Shopping');
    expect(listName('to do')).toBe('To-do');
    expect(listName('TODO')).toBe('To-do');
    expect(splitItems('milk, some eggs and bread & a lemon')).toEqual([
      'milk',
      'eggs',
      'bread',
      'lemon',
    ]);
    expect(matches('Black coffee, no sugar', 'the coffee thing')).toBe(true);
    expect(matches('Black coffee', 'tea')).toBe(false);
  });
});

describe('NotesStore', () => {
  it('adds to lists (creating them), dedupes, ticks off and clears', () => {
    const { s, onChange } = fresh();
    s.addItems('shopping', ['milk', 'eggs']);
    s.addItems('Shopping list', ['Milk', 'bread']);
    const shop = s.findList('shopping');
    expect(shop?.items.map((i) => i.text)).toEqual(['milk', 'eggs', 'bread']);
    expect(s.updateItems('shopping', 'eggs', 'done')).toEqual(['eggs']);
    s.clearDone(shop!.id);
    expect(s.findList('shopping')?.items.map((i) => i.text)).toEqual(['milk', 'bread']);
    expect(s.updateItems(null, 'bread', 'remove')).toEqual(['bread']);
    expect(onChange).toHaveBeenCalled();
  });

  it('saves to disk and reloads', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'arc-notes-')), 'notes.json');
    const a = fresh(file).s;
    a.addItems('to-do', ['call the bank']);
    a.addNote('Plumber Thursday 10am');
    a.remember('I take my coffee black');
    const b = fresh(file).s;
    expect(b.state()).toMatchObject({
      lists: [{ name: 'To-do', items: [{ text: 'call the bank', done: false }] }],
      notes: [{ text: 'Plumber Thursday 10am' }],
      memories: [{ text: 'I take my coffee black' }],
    });
    expect(todoSentence(b.state())).toBe('On your to-do list: call the bank.');
  });

  it('remembers and forgets by words or id', () => {
    const { s } = fresh();
    const m = s.remember('My car MOT is due in March');
    s.remember('My car MOT is due in March');
    expect(s.memoryTexts()).toHaveLength(1);
    expect(s.forget('the MOT thing')).toEqual(['My car MOT is due in March']);
    s.remember('Sister is called Amy');
    s.apply({ op: 'forget', id: s.state().memories[0]!.id });
    expect(s.memoryTexts()).toEqual([]);
    expect(m).not.toBeNull();
  });

  it('answers Claude’s note tools', () => {
    const { s } = fresh();
    expect(toIntent('add_to_list', { list: 'x', items: ['y'] })).toEqual({ local: 'notes' });
    expect(s.tool('add_to_list', { list: 'shopping', items: ['milk', 'eggs'] })).toEqual({
      list: 'Shopping',
      items: ['milk', 'eggs'],
    });
    expect(s.tool('update_list_item', { item: 'milk', action: 'done' })).toEqual({
      tickedOff: ['milk'],
    });
    expect(s.tool('get_lists', {})).toEqual([{ list: 'Shopping', toDo: ['eggs'], done: ['milk'] }]);
    expect(s.tool('update_list_item', { item: 'caviar', action: 'done' })).toEqual({
      error: 'No list item matching "caviar".',
    });
    expect(s.tool('remember', { fact: 'Allergic to peanuts' })).toEqual({
      remembered: 'Allergic to peanuts',
    });
    expect(s.tool('add_note', {})).toEqual({ error: 'Missing "text".' });
  });
});

describe('offline brain: lists, notes, memory', () => {
  async function ask(store: NotesStore, q: string): Promise<string> {
    const p = new MockProvider(undefined, undefined, undefined, undefined, {
      tool: (n, i) => store.tool(n, i),
      memories: () => store.memoryTexts(),
    });
    const out: ProviderChunk[] = [];
    for await (const c of p.send([{ role: 'user', content: q }], { systemPrompt: '' })) out.push(c);
    return out.map((c) => (c.type === 'text' ? c.delta : '')).join('');
  }

  it('handles everyday phrasing', async () => {
    const { s } = fresh();
    expect(await ask(s, 'Add milk, eggs and bread to my shopping list')).toMatch(
      /Added milk, eggs, bread to your shopping list/,
    );
    expect(await ask(s, "what's on my shopping list?")).toBe('Shopping: milk, eggs, bread.');
    expect(await ask(s, 'tick off eggs')).toMatch(/Ticked off eggs/);
    expect(await ask(s, 'take a note: the plumber is coming Thursday')).toMatch(/Noted/);
    expect(s.state().notes[0]?.text).toBe('the plumber is coming Thursday');
    expect(await ask(s, 'remember that I take my coffee black')).toMatch(/remember that/);
    expect(await ask(s, 'what do you remember about me?')).toBe(
      'I remember: I take my coffee black.',
    );
    expect(await ask(s, 'forget the coffee thing')).toMatch(/Forgotten/);
    expect(await ask(s, "what's on my packing list")).toMatch(/don't have a packing list/);
    // Not mistaken for list commands
    expect(await ask(s, 'check the weather')).not.toMatch(/Ticked|No list item/);
  }, 30_000);
});

describe('memory clean-up', () => {
  it('updates a memory that says the same thing instead of keeping two', () => {
    let now = 1_000;
    const n = new NotesStore({ now: () => now });
    const a = n.remember('Their PC is named Palpatine.');
    now = 2_000;
    const b = n.remember('Their PC is named Palpatine');
    expect(b?.id).toBe(a?.id);
    expect(n.state().memories).toHaveLength(1);
    expect(n.state().memories[0]?.createdAt).toBe(2_000);
  });

  it('tidies repeats and passed days, and undo puts them back', () => {
    const DAY = 86_400_000;
    let now = 10 * DAY;
    const n = new NotesStore({ now: () => now });
    n.remember(
      'They are a member of the GTA 6 voice cast playing a character named Mandy, per their own claim in this conversation.',
    );
    now = 11 * DAY;
    n.remember('Their GTA 6 voice cast role is Mandy, per their own claim.');
    n.remember('Their first shift starts at 13:15 tomorrow.');
    n.remember('They live in Neath.');
    now = 20 * DAY;
    expect(n.tidyMemories()).toEqual({ merged: 1, outOfDate: 1 });
    expect(n.state().memories.map((m) => m.text)).toEqual([
      'Their GTA 6 voice cast role is Mandy, per their own claim.',
      'They live in Neath.',
    ]);
    expect(n.state().memoryArchive).toHaveLength(2);
    expect(n.undoMemoryTidy()).toBe(2);
    expect(n.state().memories).toHaveLength(4);
    expect(n.state().memoryArchive).toHaveLength(0);
    expect(n.undoMemoryTidy()).toBe(0);
  });

  it('stops a tidy-up that would take out too much at once, changing nothing', () => {
    const DAY = 86_400_000;
    let now = 10 * DAY;
    const n = new NotesStore({ now: () => now });
    for (const t of [
      'Dentist appointment at 9:00 tomorrow.',
      'Football practice starts at 18:30 tomorrow.',
      'Parcel from Argos arrives tomorrow morning.',
      'Haircut booked for 14:00 tomorrow.',
      'Cinema with Sam at 20:00 tomorrow.',
      'They live in Neath.',
      'Their favourite game is Cyberpunk 2077.',
      'They drive a blue Corsa.',
    ])
      n.remember(t);
    const before = n.state().memories.length;
    now = 20 * DAY;
    const r = n.tidyMemories();
    expect(r.merged + r.outOfDate).toBe(0);
    expect(r.stopped).toMatch(/more than it's allowed to at once\. Nothing was changed\./);
    expect(n.state().memories).toHaveLength(before);
    expect(n.state().memoryArchive ?? []).toHaveLength(0);
  });
});
