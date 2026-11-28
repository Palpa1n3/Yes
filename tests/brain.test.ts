import { describe, expect, it } from 'vitest';
import { messageBrief } from '@shared/brain';
import { parseGraph } from '@shared/knowledge';

const graph = parseGraph(
  {
    entities: [{ name: 'Will', kind: 'person', aliases: ['Fives'], notes: ['female'] }],
    links: [{ from: 'Will', rel: 'shares shifts with', to: 'user' }],
  },
  'k',
  1,
);
const model = {
  chosen: 'claude-haiku-5-5' as const,
  auto: true,
  top: 'claude-sonnet-5-5' as const,
  saver: false,
};

describe('the central engine for each message', () => {
  it('brings in what it knows about who the message mentions', () => {
    const b = messageBrief({ text: 'Is Fives working tomorrow?', model, graph });
    expect(b.model).toBe('claude-haiku-5-5');
    expect(b.notes).toEqual([
      'What you know about who/what this message mentions: Will (person, also called Fives): female; Will shares shifts with the user.',
    ]);
  });

  it('adds the check-first note and the stronger model when needed', () => {
    const b = messageBrief({
      text: 'Compare the price of a Steam Deck and a ROG Ally, pros and cons',
      model,
      graph,
    });
    expect(b.model).toBe('claude-sonnet-5-5');
    expect(b.notes[0]).toMatch(/web search/);
  });

  it('adds nothing for an everyday message', () => {
    expect(messageBrief({ text: 'set a timer for 5 minutes', model, graph }).notes).toEqual([]);
  });
});
