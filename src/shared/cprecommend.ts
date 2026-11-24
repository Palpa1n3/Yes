/** Cyberpunk mod recommendations: Nexus Mods' trending, newly updated and newly added mods,
 *  plus the user's tracked mods, minus what's installed, ranked for this user. Pure; tested in
 *  tests/cprecommend.test.ts. */

export type RecSource = 'trending' | 'updated' | 'added' | 'tracked';

export interface RecCandidate {
  modId: number;
  name: string;
  summary: string;
  author: string;
  endorsements: number;
  /** Last change (ms). */
  updatedAt: number;
  categoryId: number | null;
  adult: boolean;
  available: boolean;
  version: string;
  picture: string;
  sources: RecSource[];
}

export interface Recommendation extends RecCandidate {
  category: string;
  reasons: string[];
  score: number;
}

/** Nexus mod JSON (v1) → a candidate (null if it isn't usable). */
export function fromNexus(j: unknown, source: RecSource): RecCandidate | null {
  const o = (j && typeof j === 'object' ? j : {}) as Record<string, unknown>;
  const id = Number(o.mod_id);
  if (!Number.isInteger(id) || id <= 0 || typeof o.name !== 'string' || !o.name.trim()) return null;
  const str = (v: unknown, n = 400): string => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  return {
    modId: id,
    name: str(o.name, 120),
    summary: str(o.summary)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&#39;|&apos;/g, '’')
      .replace(/&quot;/g, '"'),
    author: str(o.author, 60),
    endorsements: Number(o.endorsement_count) || 0,
    updatedAt: (Number(o.updated_timestamp) || 0) * 1000,
    categoryId: Number.isInteger(o.category_id) ? (o.category_id as number) : null,
    adult: o.contains_adult_content === true,
    available: o.available !== false && (o.status ?? 'published') === 'published',
    version: str(o.version, 30),
    picture: str(o.picture_url, 500),
    sources: [source],
  };
}

/** Same mod from several lists → one candidate with every source. */
export function mergeCandidates(list: RecCandidate[]): RecCandidate[] {
  const by = new Map<number, RecCandidate>();
  for (const c of list) {
    const cur = by.get(c.modId);
    if (!cur) by.set(c.modId, { ...c, sources: [...c.sources] });
    else for (const s of c.sources) if (!cur.sources.includes(s)) cur.sources.push(s);
  }
  return [...by.values()];
}

/** Rank for this user: popular, in categories they mod most, updated for the current game
 *  version, from lists that matter more (tracked > trending > updated > added). */
export function rankRecommendations(
  candidates: RecCandidate[],
  o: {
    installed: Set<number>;
    /** Category id → how many of the user's mods are in it. */
    myCategories: Map<number, number>;
    categoryNames: Map<number, string>;
    /** When the game was last updated (ms, 0 = unknown). */
    patchSeen: number;
    gameVersion: string;
    showAdult?: boolean;
    hidden?: Set<number>;
    now?: number;
  },
): Recommendation[] {
  const now = o.now ?? Date.now();
  const topCats = [...o.myCategories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const out: Recommendation[] = [];
  for (const c of mergeCandidates(candidates)) {
    if (o.installed.has(c.modId) || o.hidden?.has(c.modId) || !c.available) continue;
    if (c.adult && !o.showAdult) continue;
    const reasons: string[] = [];
    let score = Math.log10(c.endorsements + 1) * 2;
    if (c.sources.includes('tracked')) {
      score += 4;
      reasons.push('You track it on Nexus');
    }
    if (c.sources.includes('trending')) {
      score += 2.5;
      reasons.push('Trending now');
    }
    if (c.sources.includes('updated')) score += 1;
    if (c.sources.includes('added')) {
      score += 0.5;
      reasons.push('New on Nexus');
    }
    const cat = c.categoryId !== null ? (o.categoryNames.get(c.categoryId) ?? '') : '';
    const mine = c.categoryId !== null ? (o.myCategories.get(c.categoryId) ?? 0) : 0;
    if (mine && topCats.some(([id]) => id === c.categoryId)) {
      score += 2;
      reasons.push(`You have ${mine} ${cat || 'similar'} mod${mine === 1 ? '' : 's'}`);
    }
    if (o.patchSeen && c.updatedAt >= o.patchSeen) {
      score += 1.5;
      reasons.push(`Updated for ${o.gameVersion || 'the current version'}`);
    } else if (o.patchSeen && c.updatedAt < o.patchSeen) score -= 2;
    // Fresher is better, gently (half a point off per month since its last update, up to 3).
    score -= Math.min(3, (now - c.updatedAt) / (60 * 86_400_000));
    if (c.endorsements >= 1000)
      reasons.push(`${Math.round(c.endorsements / 100) / 10}k endorsements`);
    out.push({ ...c, category: cat, reasons, score: Math.round(score * 100) / 100 });
  }
  return out.sort((a, b) => b.score - a.score);
}
