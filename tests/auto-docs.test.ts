import { describe, expect, it } from 'vitest';
import { buildCodeMap } from '@shared/code-map';
import { docStale, purposeOf, renderCodebaseDoc, renderToolsDoc } from '@shared/auto-docs';

describe('Alton writing its own docs', () => {
  it('finds each file’s purpose from its opening comment, or its first export’s', () => {
    expect(
      purposeOf('/** Spending: what Claude costs. More detail here. */\nexport const a = 1;'),
    ).toBe('Spending: what Claude costs.');
    expect(
      purposeOf(
        "import x from 'y';\n\n/** The window's top bar.\n *  Second line. */\nexport function Bar() {}",
      ),
    ).toBe("The window's top bar.");
    expect(purposeOf('// Ensures the binary is there.\nconst x = 1;')).toBe(
      'Ensures the binary is there.',
    );
    expect(purposeOf('/* eslint-disable */\nexport const a = 1;')).toBe('');
    expect(purposeOf('export const a = 1;')).toBe('');
  });

  it('writes the codebase doc: areas in order, each file with purpose, size, users and tests', () => {
    const files = [
      {
        path: 'src/shared/usage.ts',
        text: '/** What Claude costs. */\nexport const costOf = 1;\n',
      },
      {
        path: 'src/main/tracker.ts',
        text: "/** Records spending. */\nimport { costOf } from '@shared/usage';\nexport const t = costOf;\n",
      },
      { path: 'scripts/build.cjs', text: '// Builds it.\n' },
      { path: 'tests/usage.test.ts', text: "import { costOf } from '@shared/usage';\n" },
    ];
    const doc = renderCodebaseDoc(buildCodeMap(files), files, '9.9.9');
    expect(doc).toMatch(/version 9\.9\.9/);
    expect(doc).toMatch(/3 source files, .* lines, 1 test files\./);
    expect(doc.indexOf('## src/main')).toBeLessThan(doc.indexOf('## src/shared'));
    expect(doc.indexOf('## src/shared')).toBeLessThan(doc.indexOf('## scripts'));
    expect(doc).toContain('| `usage.ts` | What Claude costs. | 3 | 1 | 1 |');
    expect(doc).toContain('| `tracker.ts` | Records spending. | 4 | 0 | 0 |');
  });

  it('writes the tools doc, and spots when a doc is out of date', () => {
    const doc = renderToolsDoc(
      [
        { name: 'set_volume', description: 'Change the  volume.' },
        { name: 'add_note', description: 'Save a note.' },
      ],
      '1.0.0',
    );
    expect(doc).toContain('2 tools.');
    expect(doc.indexOf('add_note')).toBeLessThan(doc.indexOf('set_volume'));
    expect(doc).toContain('- **set_volume**: Change the volume.');
    // Only the version changed: not stale. Different content or a missing file: stale.
    expect(docStale(doc.replace('1.0.0', '1.0.1'), doc)).toBe(false);
    expect(docStale(doc.replace(/\n/g, '\r\n'), doc)).toBe(false);
    expect(docStale(`${doc}- **new**: x\n`, doc)).toBe(true);
    expect(docStale(null, doc)).toBe(true);
  });
});
