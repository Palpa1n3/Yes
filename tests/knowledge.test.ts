import { describe, expect, it } from 'vitest';
import { factsAbout, findMentions, memoriesKey, parseGraph, whosWho } from '@shared/knowledge';

const raw = {
  entities: [
    { name: 'Will', kind: 'person', aliases: ['Fives'], notes: ['female', 'uses Phone Link'] },
    { name: 'Customer Cafe', kind: 'organisation', aliases: [], notes: ['in Neath'] },
    { name: 'Neath', kind: 'place' },
    { name: 'Alton', kind: 'project', aliases: ['ARC'], notes: ['their own AI assistant'] },
    { name: 'Palpatine', kind: 'thing', notes: ['their PC'] },
    { name: 'Bad', kind: 'spaceship' },
    { name: 'The user', kind: 'person' },
  ],
  links: [
    { from: 'Will', rel: 'Shares shifts with', to: 'user' },
    { from: 'user', rel: 'works at', to: 'Customer Cafe' },
    { from: 'user', rel: 'lives in', to: 'Neath' },
    { from: 'ARC', rel: 'runs on', to: 'Palpatine' },
    { from: 'Nobody', rel: 'knows', to: 'Will' },
    { from: 'user', rel: 'works at', to: 'Customer Cafe' },
  ],
};

describe('the knowledge graph', () => {
  const g = parseGraph(raw, 'k', 1);

  it('keeps known kinds and links between known things only', () => {
    expect(g.entities.map((e) => e.id)).toEqual([
      'user',
      'will',
      'customer-cafe',
      'neath',
      'alton',
      'palpatine',
    ]);
    // Aliases resolve ("ARC" → Alton); unknown ends and repeats are dropped.
    expect(g.links).toEqual([
      { from: 'will', rel: 'shares shifts with', to: 'user' },
      { from: 'user', rel: 'works at', to: 'customer-cafe' },
      { from: 'user', rel: 'lives in', to: 'neath' },
      { from: 'alton', rel: 'runs on', to: 'palpatine' },
    ]);
    expect(parseGraph(null, 'k', 1).entities).toHaveLength(1);
  });

  it('describes one thing with its links', () => {
    expect(factsAbout(g, 'will')).toEqual([
      'Will (person, also called Fives): female; uses Phone Link',
      'Will shares shifts with the user',
    ]);
  });

  it('finds what a message is about, by name or other name', () => {
    expect(findMentions(g, 'Is Fives working tomorrow?').map((e) => e.id)).toEqual(['will']);
    expect(findMentions(g, 'update arc please').map((e) => e.id)).toEqual(['alton']);
    expect(findMentions(g, 'willing to help')).toEqual([]);
  });

  it('gives chat a short who’s who, people first', () => {
    const w = whosWho(g);
    expect(w.startsWith("Who's who")).toBe(true);
    expect(w.indexOf('Will')).toBeLessThan(w.indexOf('Alton'));
    expect(w).toMatch(/Will \(aka Fives\) — shares shifts with the user/);
    expect(w.length).toBeLessThanOrEqual(500);
  });

  it('notices when memories change', () => {
    expect(memoriesKey(['a', 'b'])).toBe(memoriesKey(['b', 'a']));
    expect(memoriesKey(['a', 'b'])).not.toBe(memoriesKey(['a', 'c']));
  });
});
