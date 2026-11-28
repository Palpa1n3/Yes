import { describe, expect, it } from 'vitest';
import { ideaId, propose, sortProposals, type Proposal } from '@shared/proposals';
import { diagnose, parseLogLine } from '@shared/self-diagnosis';

const lines = [
  ...Array.from({ length: 25 }, (_, i) =>
    parseLogLine(
      `2026-11-${String(10 + (i % 15)).padStart(2, '0')}T10:00:00.000Z WARN [ui] The ScriptProcessorNode is deprecated. (index-Ab12Cd34.js:${100 + i})`,
    ),
  ),
  parseLogLine('2026-11-27T10:00:00.000Z ERROR [main] Uncaught: TypeError: x is undefined'),
  parseLogLine('2026-11-27T10:00:00.000Z WARN [net] fetch failed ENOTFOUND api.example.test'),
].filter((l): l is NonNullable<typeof l> => !!l);
const diagnosis = diagnose({ version: '1.3.0', lines });
const code = {
  untested: [
    { path: 'src/main/services/cyberpunk-mods.ts', lines: 2445 },
    { path: 'src/main/services/tiny.ts', lines: 40 },
  ],
  todos: [{ path: 'src/shared/usage.ts', line: 3, text: '// TODO: cache prices' }],
  biggest: [{ path: 'phone/src/main.ts', lines: 8381 }],
};

describe('Alton’s ideas for improving itself', () => {
  it('turns real problems and the code’s shape into ideas, skipping one-off blips', () => {
    const ideas = propose({ diagnosis, code, known: [], now: 1 });
    expect(ideas.map((p) => [p.kind, p.priority, p.title.slice(0, 40)])).toEqual([
      ['fix', 1, 'Fix: Uncaught: TypeError: x is undefined'],
      ['fix', 3, 'Fix: The ScriptProcessorNode is deprecat'],
      ['test', 2, 'Add tests for src/main/services/cyberpun'],
      ['cleanup', 3, 'Finish: TODO: cache prices'],
      ['cleanup', 3, 'Split phone/src/main.ts into smaller par'],
    ]);
    expect(ideas[1]?.why).toMatch(/Seen 25 times/);
    // The one network blip and the tiny untested file aren't worth an idea.
    expect(ideas.some((p) => /ENOTFOUND|tiny/.test(p.title))).toBe(false);
  });

  it('never suggests the same idea twice, even after it was dismissed', () => {
    const first = propose({ diagnosis, code, known: [], now: 1 });
    const known: Proposal[] = first.map((p, i) => ({
      ...p,
      status: i === 0 ? 'dismissed' : 'new',
    }));
    expect(propose({ diagnosis, code, known, now: 2 })).toEqual([]);
    expect(ideaId('a')).toBe(ideaId('a'));
    expect(ideaId('a')).not.toBe(ideaId('b'));
  });

  it('lists open ideas first, most worth doing first', () => {
    const p = (id: string, status: Proposal['status'], priority: 1 | 2 | 3): Proposal => ({
      id,
      kind: 'fix',
      title: id,
      why: '',
      files: [],
      effort: 'small',
      priority,
      status,
      at: 1,
    });
    expect(
      sortProposals([
        p('a', 'done', 1),
        p('b', 'new', 3),
        p('c', 'new', 1),
        p('d', 'accepted', 1),
      ]).map((x) => x.id),
    ).toEqual(['c', 'b', 'd', 'a']);
  });
});
