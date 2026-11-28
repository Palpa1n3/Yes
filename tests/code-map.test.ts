import { describe, expect, it } from 'vitest';
import {
  buildCodeMap,
  dependents,
  findSymbol,
  overview,
  resolveImport,
  testsFor,
  type SourceFile,
} from '@shared/code-map';

const files: SourceFile[] = [
  {
    path: 'src/shared/usage.ts',
    text: 'export function costOf() {}\nexport interface Usage {}\n// TODO: cache prices\n',
  },
  {
    path: 'src/main/services/tracker.ts',
    text: "import { costOf, type Usage } from '@shared/usage';\nexport class Tracker { run() { return costOf(); } }\n",
  },
  {
    path: 'src/main/ipc/app.ts',
    text: "import { Tracker } from '../services/tracker';\nexport const x = new Tracker();\n",
  },
  {
    path: 'src/main/services/lonely.ts',
    text: 'export const alone = 1;\n',
  },
  {
    path: 'tests/usage.test.ts',
    text: "import { costOf } from '@shared/usage';\nit('works', () => costOf());\n",
  },
  { path: 'scripts/build.cjs', text: "const x = require('fs');\n" },
  { path: 'README.md', text: '# not code' },
];

describe('analysing Alton’s own code', () => {
  const map = buildCodeMap(files);

  it('resolves aliases, relative paths and index files; ignores packages', () => {
    const known = new Set([
      'src/shared/usage.ts',
      'src/main/services/tracker.ts',
      'src/a/index.ts',
    ]);
    expect(resolveImport('src/main/x.ts', '@shared/usage', known)).toBe('src/shared/usage.ts');
    expect(resolveImport('src/main/ipc/app.ts', '../services/tracker', known)).toBe(
      'src/main/services/tracker.ts',
    );
    expect(resolveImport('src/b.ts', './a', known)).toBe('src/a/index.ts');
    expect(resolveImport('src/b.ts', 'electron', known)).toBeNull();
  });

  it('maps imports, exports and TODOs, and what depends on what', () => {
    const u = map.modules.get('src/shared/usage.ts');
    expect(u?.exports).toEqual(['costOf', 'Usage']);
    expect(u?.todos).toEqual([{ line: 3, text: '// TODO: cache prices' }]);
    expect(map.importedBy.get('src/shared/usage.ts')?.sort()).toEqual([
      'src/main/services/tracker.ts',
      'tests/usage.test.ts',
    ]);
    // A change to usage.ts reaches the tracker, then the app that uses the tracker.
    expect(dependents(map, 'src/shared/usage.ts')).toEqual([
      'src/main/services/tracker.ts',
      'tests/usage.test.ts',
      'src/main/ipc/app.ts',
    ]);
    expect(testsFor(map, 'src/shared/usage.ts')).toEqual(['tests/usage.test.ts']);
    expect(map.modules.has('README.md')).toBe(false);
  });

  it('finds where a name is defined and used', () => {
    const s = findSymbol(map, files, 'costOf');
    expect(s.defined).toEqual(['src/shared/usage.ts']);
    expect(s.used.map((u) => `${u.path}:${u.line}`)).toEqual([
      'src/main/services/tracker.ts:1',
      'src/main/services/tracker.ts:2',
      'tests/usage.test.ts:1',
      'tests/usage.test.ts:2',
    ]);
    expect(findSymbol(map, files, 'bad name!').used).toEqual([]);
  });

  it('gives an overview: areas, biggest, untested code and TODOs', () => {
    const o = overview(map);
    expect(o.tests).toBe(1);
    expect(o.areas.map((a) => a.area).sort()).toEqual(['scripts', 'src/main', 'src/shared']);
    expect(o.untested.map((u) => u.path).sort()).toEqual([
      'src/main/ipc/app.ts',
      'src/main/services/lonely.ts',
      'src/main/services/tracker.ts',
    ]);
    expect(o.todos).toEqual([
      { path: 'src/shared/usage.ts', line: 3, text: '// TODO: cache prices' },
    ]);
  });
});
