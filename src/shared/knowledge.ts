/** Alton's personal knowledge graph: the people, places, projects, things and events the user has
 *  mentioned, and how they connect ("Will — shares shifts with — the user", "Alton — runs on —
 *  Palpatine"). Built from memories by a small model; used to give chat a "who's who" and to look
 *  things up. Pure; tested in tests/knowledge.test.ts. */

export type EntityKind = 'person' | 'place' | 'project' | 'thing' | 'organisation' | 'event';
export const ENTITY_KINDS: EntityKind[] = [
  'person',
  'place',
  'project',
  'thing',
  'organisation',
  'event',
];

export interface Entity {
  id: string;
  name: string;
  kind: EntityKind;
  /** Other names ("Fives" for Will). */
  aliases: string[];
  /** Short facts about it ("female", "uses Phone Link"). */
  notes: string[];
}

export interface Link {
  from: string;
  /** "works at", "lives in", "partner of"… */
  rel: string;
  to: string;
}

export interface KnowledgeGraph {
  entities: Entity[];
  links: Link[];
  /** Which memories it was built from (a hash), so it's rebuilt only when they change. */
  builtFrom: string;
  builtAt: number;
}

export const EMPTY_GRAPH: KnowledgeGraph = { entities: [], links: [], builtFrom: '', builtAt: 0 };

const str = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

/** The model's answer ({ entities: [{name, kind, aliases, notes}], links: [{from, rel, to}] }),
 *  checked and cleaned: known kinds only, links only between known entities, size-capped. The
 *  user is always the entity "user". */
export function parseGraph(raw: unknown, builtFrom: string, now: number): KnowledgeGraph {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const ents = new Map<string, Entity>();
  ents.set('user', { id: 'user', name: 'the user', kind: 'person', aliases: [], notes: [] });
  for (const e of (Array.isArray(o.entities) ? o.entities : []).slice(0, 80)) {
    const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    const name = str(x.name, 60);
    const kind = ENTITY_KINDS.includes(x.kind as EntityKind) ? (x.kind as EntityKind) : null;
    if (!name || !kind || /^(the )?user$/i.test(name)) continue;
    const id = slug(name);
    if (!id || ents.has(id)) continue;
    ents.set(id, {
      id,
      name,
      kind,
      aliases: (Array.isArray(x.aliases) ? x.aliases : [])
        .map((a) => str(a, 40))
        .filter(Boolean)
        .slice(0, 5),
      notes: (Array.isArray(x.notes) ? x.notes : [])
        .map((n) => str(n, 120))
        .filter(Boolean)
        .slice(0, 6),
    });
  }
  const idOf = (name: unknown): string | null => {
    const n = str(name, 60);
    if (!n) return null;
    if (/^(the )?user$/i.test(n)) return 'user';
    const id = slug(n);
    if (ents.has(id)) return id;
    const byAlias = [...ents.values()].find((e) =>
      e.aliases.some((a) => a.toLowerCase() === n.toLowerCase()),
    );
    return byAlias?.id ?? null;
  };
  const links: Link[] = [];
  const seen = new Set<string>();
  for (const l of (Array.isArray(o.links) ? o.links : []).slice(0, 200)) {
    const x = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>;
    const from = idOf(x.from);
    const to = idOf(x.to);
    const rel = str(x.rel, 40).toLowerCase();
    if (!from || !to || !rel || from === to) continue;
    const key = `${from}|${rel}|${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ from, rel, to });
  }
  return { entities: [...ents.values()], links, builtFrom, builtAt: now };
}

/** A cheap fingerprint of the memories (rebuild only when they change). */
export function memoriesKey(texts: string[]): string {
  let h = 5381;
  for (const c of [...texts].sort().join('\n')) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return `${texts.length}:${h.toString(36)}`;
}

const nameOf = (g: KnowledgeGraph, id: string): string =>
  g.entities.find((e) => e.id === id)?.name ?? id;

/** Everything known about one entity, as short lines. */
export function factsAbout(g: KnowledgeGraph, id: string): string[] {
  const e = g.entities.find((x) => x.id === id);
  if (!e) return [];
  const lines = [
    `${e.name} (${e.kind}${e.aliases.length ? `, also called ${e.aliases.join(', ')}` : ''})${
      e.notes.length ? `: ${e.notes.join('; ')}` : ''
    }`,
  ];
  for (const l of g.links)
    if (l.from === id) lines.push(`${e.name} ${l.rel} ${nameOf(g, l.to)}`);
    else if (l.to === id) lines.push(`${nameOf(g, l.from)} ${l.rel} ${e.name}`);
  return lines;
}

/** Entities a piece of text mentions (by name or other name, whole words). */
export function findMentions(g: KnowledgeGraph, text: string): Entity[] {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  return g.entities.filter(
    (e) =>
      e.id !== 'user' &&
      [e.name, ...e.aliases].some((n) => {
        const w = n
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();
        return w.length > 1 && t.includes(` ${w} `);
      }),
  );
}

/** A short "who's who" for chat: people first, then projects and places (≤ ~500 characters). */
export function whosWho(g: KnowledgeGraph): string {
  const order: EntityKind[] = ['person', 'project', 'place', 'organisation', 'thing', 'event'];
  const parts: string[] = [];
  for (const kind of order)
    for (const e of g.entities.filter((x) => x.kind === kind && x.id !== 'user')) {
      const toUser = g.links.find(
        (l) => (l.from === e.id && l.to === 'user') || (l.to === e.id && l.from === 'user'),
      );
      const how = toUser
        ? toUser.from === e.id
          ? `${toUser.rel} the user`
          : `the user ${toUser.rel} it`
        : e.notes[0];
      parts.push(
        `${e.name}${e.aliases.length ? ` (aka ${e.aliases[0]})` : ''}${how ? ` — ${how}` : ''}`,
      );
    }
  if (!parts.length) return '';
  let out = `Who's who (from what the user has told you): ${parts.join('; ')}.`;
  if (out.length > 500) out = `${out.slice(0, 497)}…`;
  return out;
}
