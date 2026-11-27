import { describe, expect, it } from 'vitest';
import { outOfDate, planTidy, similarity, tidyCount, SAME_THING } from '@shared/memory-tidy';

const DAY = 86_400_000;
const now = 100 * DAY;

describe('tidying memories', () => {
  it('sees when two memories say the same thing', () => {
    expect(
      similarity(
        'They play Minecraft on Lunar Client, version 26.3.',
        'Their Minecraft client is Lunar Client, version 26.3.',
      ),
    ).toBeGreaterThan(0.5);
    expect(
      similarity(
        'Their GTA 6 voice cast role is Mandy, per their own claim.',
        'They are a member of the GTA 6 voice cast playing a character named Mandy, per their own claim in this conversation.',
      ),
    ).toBeGreaterThanOrEqual(0.5);
    expect(
      similarity('Their PC is named Palpatine.', 'They work shifts at Customer Cafe.'),
    ).toBeLessThan(0.2);
    expect(
      similarity('Their PC is named Palpatine.', 'Their PC is named Palpatine'),
    ).toBeGreaterThanOrEqual(SAME_THING);
  });

  it('retires memories about a moment that has passed', () => {
    const m = {
      id: 'a',
      text: 'Their first shift starts at 13:15 tomorrow.',
      createdAt: now - 5 * DAY,
    };
    expect(outOfDate(m, now)).toBe(true);
    expect(outOfDate({ ...m, createdAt: now - DAY }, now)).toBe(false);
    expect(outOfDate({ id: 'b', text: 'They live in Neath.', createdAt: 0 }, now)).toBe(false);
    // A one-off on a date that's over.
    const nov25 = new Date(2026, 10, 25).getTime();
    const dated = {
      id: 'c',
      text: 'Their shift on Thursday 26 Nov is 12:00 to 18:30.',
      createdAt: nov25,
    };
    expect(outOfDate(dated, new Date(2026, 10, 27).getTime())).toBe(false);
    expect(outOfDate(dated, new Date(2026, 10, 30).getTime())).toBe(true);
  });

  it('plans merges that keep the newest wording, and leaves different things alone', () => {
    const p = planTidy(
      [
        {
          id: 'old',
          text: 'They play Minecraft on Lunar Client, version 26.3.',
          createdAt: now - 9 * DAY,
        },
        {
          id: 'new',
          text: 'Their Minecraft client is Lunar Client, version 26.3.',
          createdAt: now - DAY,
        },
        { id: 'pc', text: 'Their PC is named Palpatine.', createdAt: now - 20 * DAY },
        {
          id: 'shift',
          text: 'Their first shift starts at 13:15 tomorrow.',
          createdAt: now - 6 * DAY,
        },
      ],
      now,
    );
    expect(p.merges).toEqual([{ keep: 'new', drop: ['old'] }]);
    expect(p.outOfDate).toEqual(['shift']);
    expect(tidyCount(p)).toBe(2);
  });

  it('does not merge across projects', () => {
    const p = planTidy(
      [
        { id: 'a', text: 'Uses React for the UI.', createdAt: 1, project: 'Alton' },
        { id: 'b', text: 'Uses React for the UI.', createdAt: 2, project: 'Website' },
      ],
      now,
    );
    expect(p.merges).toEqual([]);
  });
});
