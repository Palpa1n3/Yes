/** What Alton may change in its development copy (Phase 3, item 4). Source and tests, yes;
 *  dependencies, build and release setup, the git folder, keys and secrets, never: changes there
 *  could run code at install or build time, or reach outside. Pure; tested in
 *  tests/sandbox-rules.test.ts. */

/** Why this path can't be written, or null when it can. */
export function blockedPath(raw: string): string | null {
  const p = raw.replace(/\\/g, '/').replace(/^\.\//, '').trim();
  if (!p) return 'No path given.';
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.split('/').includes('..'))
    return 'Only paths inside the project, like src/main/services/email.ts.';
  if (p.length > 200) return 'That path is too long.';
  const lower = p.toLowerCase();
  const parts = lower.split('/');
  if (parts.some((x) => x === '.git' || x === 'node_modules' || x === 'out' || x === 'dist'))
    return 'Not the git folder, dependencies or build output.';
  if (
    /^(package\.json|package-lock\.json|npm-shrinkwrap\.json|\.npmrc|yarn\.lock|pnpm-lock\.yaml)$/.test(
      parts.at(-1) ?? '',
    )
  )
    return 'Not dependencies or package settings: those need the owner to change them.';
  if (
    parts[0] === '.github' ||
    parts[0] === 'scripts' ||
    parts[0] === 'build' ||
    parts[0] === 'android'
  )
    return 'Not the build, release or Android setup.';
  if (
    /^(electron-builder|electron\.vite\.config|vite\.config|vitest\.config|tsconfig)[\w.-]*$/.test(
      parts.at(-1) ?? '',
    )
  )
    return 'Not the build or test configuration.';
  if (/(^|\/)\.env|\.(bin|key|pem|pfx|p12)$|secret|credential/.test(lower))
    return 'Not keys, passwords or secrets.';
  if (!/^(src|tests|phone\/src|docs-src)\//.test(lower) && !/^[\w.-]+\.md$/.test(lower))
    return 'Only source (src/, phone/src/), tests (tests/) or the .md notes at the top.';
  if (!/\.(ts|tsx|css|html|md|json)$/.test(lower))
    return 'Only code, styles, pages, notes or JSON data.';
  return null;
}

/** A find-and-replace edit on text: the find must appear exactly once. */
export function applyEdit(
  text: string,
  find: string,
  replace: string,
): { text: string } | { error: string } {
  if (!find) return { error: 'Nothing to find.' };
  const first = text.indexOf(find);
  if (first < 0)
    return { error: "That text isn't in the file (it must match exactly, spaces included)." };
  if (text.indexOf(find, first + find.length) >= 0)
    return { error: 'That text appears more than once; include more around it so it is unique.' };
  return { text: text.slice(0, first) + replace + text.slice(first + find.length) };
}

/** The checks run in the copy: the project's own, never commands the AI chose. */
export const SANDBOX_CHECKS: Array<{ name: string; command: string; timeoutMs: number }> = [
  { name: 'Typecheck', command: 'npm run -s typecheck', timeoutMs: 6 * 60_000 },
  { name: 'Lint', command: 'npx eslint .', timeoutMs: 6 * 60_000 },
  { name: 'Tests', command: 'npx vitest run', timeoutMs: 10 * 60_000 },
];

/** The last useful lines of a check's output (errors first). */
export function checkSummary(out: string, max = 40): string {
  const lines = out.split(/\r?\n/).filter((l) => l.trim());
  const important = lines.filter((l) => /error|fail|×|✗|expected|received|TS\d{4}/i.test(l));
  const pick = important.length ? important : lines;
  return pick.slice(-max).join('\n').slice(-6000);
}
