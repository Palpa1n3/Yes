/** Automatic documentation (Phase 3, item 8): Alton writes its own docs from its code, so they
 *  never drift. CODEBASE.md: every area and file with its purpose (the file's opening comment),
 *  size, how much depends on it and whether tests cover it. TOOLS.md: everything Alton can do in
 *  chat, from its own tool definitions. Pure; tested in tests/auto-docs.test.ts. */
import { testsFor, type CodeMap, type SourceFile } from './code-map';

/** A file's purpose: the first sentence of its opening comment ("" if it has none). */
export function purposeOf(text: string): string {
  const m = /^\s*(?:\/\/[^\n]*\n\s*)*\/\*\*?([\s\S]*?)\*\//.exec(text);
  // Otherwise: the doc comment on the first thing the file exports.
  const onExport = /\/\*\*((?:(?!\*\/)[\s\S])*?)\*\/\s*export\s/.exec(text);
  const lead =
    m?.[1] ??
    onExport?.[1] ??
    (/^\s*((?:\/\/[^\n]*\n)+)/.exec(text)?.[1] ?? '').replace(/^\s*\/\/\s?/gm, ' ');
  const flat = lead
    .replace(/^\s*\*\s?/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!flat || /^eslint|^@ts-|^prettier/i.test(flat)) return '';
  const first = /^(.+?[.!?])(\s|$)/.exec(flat)?.[1] ?? flat;
  return first.length > 180 ? `${first.slice(0, 177)}…` : first;
}

const AREA_NAMES: Record<string, string> = {
  'src/main': 'PC app: main process (services, system access, IPC)',
  'src/renderer': 'PC app: the window (React UI)',
  'src/shared': 'Shared logic (pure, tested)',
  'src/preload': 'PC app: the bridge between window and main',
  'phone/src': 'Phone app',
};

const esc = (s: string): string => s.replace(/\|/g, '\\|');

export function renderCodebaseDoc(map: CodeMap, files: SourceFile[], version: string): string {
  const text = new Map(files.map((f) => [f.path, f.text]));
  const src = [...map.modules.values()].filter((m) => !m.test);
  const areas = new Map<string, typeof src>();
  for (const m of src) {
    const parts = m.path.split('/');
    const area = parts.slice(0, Math.min(2, parts.length - 1)).join('/') || '.';
    areas.set(area, [...(areas.get(area) ?? []), m]);
  }
  // The known areas first, in their order; anything else after them.
  const rank = (a: string): number => {
    const i = Object.keys(AREA_NAMES).indexOf(a);
    return i < 0 ? 99 : i;
  };
  const order = [...areas.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const out: string[] = [
    '# Alton codebase',
    '',
    `Written automatically by Alton from its own code (version ${version}); don't edit by hand.`,
    `${src.length} source files, ${src.reduce((n, m) => n + m.lines, 0).toLocaleString('en-GB')} lines, ${
      map.modules.size - src.length
    } test files.`,
    '',
  ];
  for (const area of order) {
    const mods = (areas.get(area) ?? []).sort((a, b) => a.path.localeCompare(b.path));
    out.push(
      `## ${area}${AREA_NAMES[area] ? `: ${AREA_NAMES[area]}` : ''}`,
      '',
      '| File | What it does | Lines | Used by | Tests |',
      '| --- | --- | ---: | ---: | ---: |',
    );
    for (const m of mods)
      out.push(
        `| \`${m.path.slice(area.length + 1)}\` | ${esc(purposeOf(text.get(m.path) ?? '')) || '—'} | ${m.lines} | ${
          map.importedBy.get(m.path)?.filter((p) => !map.modules.get(p)?.test).length ?? 0
        } | ${testsFor(map, m.path).length} |`,
      );
    out.push('');
  }
  return `${out.join('\n').trimEnd()}\n`;
}

export interface ToolDoc {
  name: string;
  description?: string;
}

export function renderToolsDoc(tools: ToolDoc[], version: string): string {
  const out = [
    '# What Alton can do',
    '',
    `Written automatically by Alton from its own tool definitions (version ${version}); don't edit by hand.`,
    `${tools.length} tools.`,
    '',
  ];
  for (const t of [...tools].sort((a, b) => a.name.localeCompare(b.name)))
    out.push(`- **${t.name}**: ${(t.description ?? '').replace(/\s+/g, ' ').trim() || '—'}`);
  return `${out.join('\n')}\n`;
}

/** Is a saved doc out of date? (The version line is ignored: only real changes count.) */
export function docStale(saved: string | null, fresh: string): boolean {
  const norm = (s: string): string =>
    s
      .replace(/\r\n/g, '\n')
      .replace(/\(version [^)]*\)/g, '')
      .trim();
  return saved === null || norm(saved) !== norm(fresh);
}
