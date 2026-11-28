import { describe, expect, it } from 'vitest';
import { parseRoadmap, roadmapStatus, wishesVsPlan } from '@shared/dev-roadmap';

const md = [
  '# Alton roadmap',
  '',
  '## Phase 1: Safety foundations (done, 0.81–0.90)',
  '',
  '- ✅ Automatic backups and recovery. **0.81:** daily copies of data.',
  '- ✅ Rollback after a broken update.',
  '',
  '## Phase 3: Self-development (started)',
  '- ✅ Self-diagnosis and error analysis (partly there). **1.1.0:** reads the log.',
  '- 🔶 Development roadmap management (partly there: Notes).',
  '- ⬜ Automatic documentation.',
  '  continuation line that is not an item',
  '',
  '## Phase 4: Persistent agents',
  '- ⬜ Multiple simultaneous background tasks.',
  '',
  '## Notes',
  'Nothing listed here.',
].join('\n');

describe('Alton’s development roadmap', () => {
  it('reads phases and items with their state, without the version notes', () => {
    const p = parseRoadmap(md);
    expect(p.map((x) => [x.title, x.note, x.items.length])).toEqual([
      ['Phase 1: Safety foundations', 'done, 0.81–0.90', 2],
      ['Phase 3: Self-development', 'started', 3],
      ['Phase 4: Persistent agents', '', 1],
    ]);
    expect(p[0]?.items[0]).toEqual({ text: 'Automatic backups and recovery.', state: 'done' });
    expect(p[1]?.items.map((i) => i.state)).toEqual(['done', 'partial', 'todo']);
    expect(p[1]?.items[0]?.text).toBe('Self-diagnosis and error analysis (partly there).');
  });

  it('knows where it is up to and what comes next', () => {
    const s = roadmapStatus(parseRoadmap(md));
    expect(s.current).toBe('Phase 3: Self-development');
    expect(s.next.map((n) => n.text)).toEqual([
      'Development roadmap management (partly there: Notes).',
      'Automatic documentation.',
      'Multiple simultaneous background tasks.',
    ]);
    expect([s.done, s.total]).toEqual([3, 6]);
    expect(s.phases[1]).toEqual({
      title: 'Phase 3: Self-development',
      note: 'started',
      done: 1,
      partial: 1,
      total: 3,
    });
  });

  it('lines wishes up against the plan', () => {
    const r = wishesVsPlan(
      [
        { text: 'Run several background tasks at the same time', done: false },
        { text: 'Make me a sandwich', done: false },
        { text: 'Automatic backups', done: true },
      ],
      parseRoadmap(md),
    );
    expect(r.planned).toEqual([
      {
        wish: 'Run several background tasks at the same time',
        item: 'Multiple simultaneous background tasks.',
      },
    ]);
    expect(r.notPlanned).toEqual(['Make me a sandwich']);
  });
});
