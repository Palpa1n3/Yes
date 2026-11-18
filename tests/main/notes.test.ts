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
