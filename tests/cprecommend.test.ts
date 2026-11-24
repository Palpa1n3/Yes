import { describe, expect, it } from 'vitest';
import { fromNexus, mergeCandidates, rankRecommendations } from '@shared/cprecommend';

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 24);
const patch = Date.UTC(2026, 9, 23);
const mod = (id: number, p: Record<string, unknown> = {}) => ({
  mod_id: id,
  name: `Mod ${id}`,
  summary: 'A <b>great</b> mod &amp; more<br/>really',
  author: 'Someone',
  endorsement_count: 100,
  updated_timestamp: (now - 5 * DAY) / 1000,
  category_id: 3,
  contains_adult_content: false,
  available: true,
  status: 'published',
  version: '1.0',
  picture_url: 'https://staticdelivery.nexusmods.com/x.jpg',
  ...p,
});

describe('mod recommendations', () => {
  it('reads Nexus mods and merges lists', () => {
    const c = fromNexus(mod(1), 'trending');
    expect(c).toMatchObject({ modId: 1, summary: 'A great mod & more really', categoryId: 3 });
    expect(fromNexus({ mod_id: 'x' }, 'trending')).toBeNull();
    const m = mergeCandidates([c!, fromNexus(mod(1), 'tracked')!]);
    expect(m).toHaveLength(1);
    expect(m[0]?.sources).toEqual(['trending', 'tracked']);
  });
  it('leaves out installed, hidden, adult and unavailable mods', () => {
    const r = rankRecommendations(
      [
        fromNexus(mod(1), 'trending')!,
        fromNexus(mod(2), 'trending')!,
        fromNexus(mod(3, { contains_adult_content: true }), 'trending')!,
        fromNexus(mod(4, { available: false }), 'trending')!,
        fromNexus(mod(5), 'trending')!,
      ],
      {
        installed: new Set([1]),
        hidden: new Set([5]),
        myCategories: new Map(),
        categoryNames: new Map(),
        patchSeen: patch,
        gameVersion: '2.50',
        now,
      },
    );
    expect(r.map((x) => x.modId)).toEqual([2]);
  });
  it('ranks tracked, popular, my-category and updated-for-this-version mods first', () => {
    const r = rankRecommendations(
      [
        fromNexus(
          mod(10, { endorsement_count: 50, updated_timestamp: (patch - 200 * DAY) / 1000 }),
          'added',
        )!,
        fromNexus(mod(11, { endorsement_count: 20000, category_id: 7 }), 'trending')!,
        fromNexus(mod(12, { endorsement_count: 10 }), 'tracked')!,
      ],
      {
        installed: new Set(),
        myCategories: new Map([[7, 40]]),
        categoryNames: new Map([[7, 'Gameplay']]),
        patchSeen: patch,
        gameVersion: '2.50',
        now,
      },
    );
    expect(r.map((x) => x.modId)).toEqual([11, 12, 10]);
    expect(r[0]?.reasons).toEqual([
      'Trending now',
      'You have 40 Gameplay mods',
      'Updated for 2.50',
      '20k endorsements',
    ]);
    expect(r[1]?.reasons).toContain('You track it on Nexus');
  });
});
