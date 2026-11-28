/** Source code analysis (Phase 3, item 2): a map of Alton's own code from its files, so it can
 *  answer "where is X done?", "what uses this?", "what would a change here affect?", "what has no
 *  tests?" and "where are the big or unfinished parts?" without reading every file. Read-only;
 *  works on the text of the files. Pure; tested in tests/code-map.test.ts. */

export interface SourceFile {
  path: string;
  text: string;
}

export interface ModuleInfo {
  path: string;
  lines: number;
  /** Resolved project paths this file imports. */
  imports: string[];
  /** Names it exports. */
  exports: string[];
  /** TODO / FIXME / HACK lines. */
  todos: Array<{ line: number; text: string }>;
  test: boolean;
}

export interface CodeMap {
  modules: Map<string, ModuleInfo>;
  /** path → the files that import it. */
  importedBy: Map<string, string[]>;
}

const CODE = /\.(ts|tsx|js|mjs|cjs)$/;
const ALIASES: Array<[string, string]> = [
  ['@shared/', 'src/shared/'],
  ['@renderer/', 'src/renderer/'],
  ['@main/', 'src/main/'],
];

const isTest = (p: string): boolean => /(^|\/)tests?\//.test(p) || /\.test\.(ts|tsx)$/.test(p);

/** An import specifier from `from` → the project file it means (null for packages). */
export function resolveImport(from: string, spec: string, known: Set<string>): string | null {
  let base: string | null = null;
  for (const [a, to] of ALIASES) if (spec.startsWith(a)) base = to + spec.slice(a.length);
  if (!base && spec.startsWith('.')) {
    const parts = from.split('/').slice(0, -1);
    for (const seg of spec.split('/')) {
      if (seg === '.' || seg === '') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    base = parts.join('/');
  }
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`])
    if (known.has(c)) return c;
  return null;
}

const IMPORT_RE =
  /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const EXPORT_RE =
  /export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|interface|type|enum|abstract\s+class)\s+([A-Za-z_$][\w$]*)/g;

export function buildCodeMap(files: SourceFile[]): CodeMap {
  const code = files.filter((f) => CODE.test(f.path));
  const known = new Set(code.map((f) => f.path));
  const modules = new Map<string, ModuleInfo>();
  const importedBy = new Map<string, string[]>();
  for (const f of code) {
    const imports = new Set<string>();
    for (const m of f.text.matchAll(IMPORT_RE)) {
      const r = resolveImport(f.path, m[1] ?? m[2] ?? '', known);
      if (r && r !== f.path) imports.add(r);
    }
    const exports = [...new Set([...f.text.matchAll(EXPORT_RE)].map((m) => m[1] ?? ''))].filter(
      Boolean,
    );
    const lines = f.text.split('\n');
    const todos = lines
      .map((t, i) => ({ line: i + 1, text: t.trim() }))
      // A real note in a comment ("// TODO: …", "/* FIXME(…)"), not the word in text or code.
      .filter((l) => /(\/\/|\/\*+|^\*)\s*(TODO|FIXME|HACK|XXX)\s*[:(]/.test(l.text))
      .slice(0, 20);
    modules.set(f.path, {
      path: f.path,
      lines: lines.length,
      imports: [...imports].sort(),
      exports,
      todos,
      test: isTest(f.path),
    });
    for (const i of imports) importedBy.set(i, [...(importedBy.get(i) ?? []), f.path]);
  }
  return { modules, importedBy };
}

/** Everything that depends on `path`, directly or through other files (nearest first). */
export function dependents(map: CodeMap, path: string, limit = 80): string[] {
  const seen = new Set<string>([path]);
  const out: string[] = [];
  let frontier = [path];
  while (frontier.length && out.length < limit) {
    const next: string[] = [];
    for (const p of frontier)
      for (const d of map.importedBy.get(p) ?? [])
        if (!seen.has(d)) {
          seen.add(d);
          out.push(d);
          next.push(d);
        }
    frontier = next;
  }
  return out.slice(0, limit);
}

/** The tests that cover `path` (they import it, directly or through what they import). */
export function testsFor(map: CodeMap, path: string): string[] {
  return dependents(map, path, 400).filter((p) => map.modules.get(p)?.test);
}

/** Where a name is defined, and where it's used (file:line). */
export function findSymbol(
  map: CodeMap,
  files: SourceFile[],
  name: string,
  limit = 40,
): { defined: string[]; used: Array<{ path: string; line: number; text: string }> } {
  if (!/^[A-Za-z_$][\w$]{1,60}$/.test(name)) return { defined: [], used: [] };
  const defined = [...map.modules.values()]
    .filter((m) => m.exports.includes(name))
    .map((m) => m.path);
  const word = new RegExp(`(^|[^\\w$])${name.replace(/\$/g, '\\$')}(?![\\w$])`);
  const used: Array<{ path: string; line: number; text: string }> = [];
  for (const f of files) {
    if (!CODE.test(f.path)) continue;
    const lines = f.text.split('\n');
    for (let i = 0; i < lines.length && used.length < limit; i++) {
      const t = lines[i] ?? '';
      if (!word.test(t)) continue;
      if (defined.includes(f.path) && /\bexport\b/.test(t)) continue;
      used.push({ path: f.path, line: i + 1, text: t.trim().slice(0, 160) });
    }
  }
  return { defined, used };
}

/** The shape of the project: areas, biggest files, untested code, unfinished bits. */
export function overview(map: CodeMap): {
  files: number;
  lines: number;
  tests: number;
  areas: Array<{ area: string; files: number; lines: number }>;
  biggest: Array<{ path: string; lines: number }>;
  untested: Array<{ path: string; lines: number }>;
  todos: Array<{ path: string; line: number; text: string }>;
} {
  const mods = [...map.modules.values()];
  const src = mods.filter((m) => !m.test);
  const areas = new Map<string, { files: number; lines: number }>();
  for (const m of src) {
    const parts = m.path.split('/');
    // The top two folders (a file straight in a folder belongs to that folder).
    const area = parts.slice(0, Math.min(2, parts.length - 1)).join('/') || '.';
    const a = areas.get(area) ?? { files: 0, lines: 0 };
    a.files++;
    a.lines += m.lines;
    areas.set(area, a);
  }
  const untested = src
    .filter((m) => /^src\/(shared|main)\//.test(m.path) && m.exports.length > 0)
    .filter((m) => testsFor(map, m.path).length === 0)
    .sort((a, b) => b.lines - a.lines);
  return {
    files: src.length,
    lines: src.reduce((n, m) => n + m.lines, 0),
    tests: mods.length - src.length,
    areas: [...areas.entries()]
      .map(([area, a]) => ({ area, ...a }))
      .sort((a, b) => b.lines - a.lines),
    biggest: [...src]
      .sort((a, b) => b.lines - a.lines)
      .slice(0, 10)
      .map((m) => ({ path: m.path, lines: m.lines })),
    untested: untested.slice(0, 15).map((m) => ({ path: m.path, lines: m.lines })),
    todos: src.flatMap((m) => m.todos.map((t) => ({ path: m.path, ...t }))).slice(0, 25),
  };
}
