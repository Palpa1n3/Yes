/** Intended against actual changes for Alton's own automated jobs (safety gate 2).
 *  Before a job changes anything it says what it means to change; afterwards the real changes are
 *  compared with that, and a mismatch stops the job (nothing is committed, pushed or kept) and is
 *  reported. Pure; tested in tests/intended.test.ts. */

export type ChangeOp = 'add' | 'modify' | 'delete';

export interface Change {
  /** A file path (any slashes) or an item id. */
  target: string;
  op: ChangeOp;
}

export interface ChangeCheck {
  ok: boolean;
  /** Changed, but not part of the plan. */
  unexpected: Change[];
  /** Planned, but didn't happen. */
  missing: Change[];
  /** Happened, but not the way that was planned (e.g. deleted instead of changed). */
  different: Array<{ target: string; meant: ChangeOp; did: ChangeOp }>;
}

/** Same path however it's written: forward slashes, no "./", case-insensitive (Windows). */
export const changeKey = (t: string): string =>
  t
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/{2,}/g, '/')
    .toLowerCase();

/** Compare what a job meant to change with what changed. `strict: false` lets planned changes
 *  that didn't happen pass (e.g. a file copied over with the same content). */
export function compareChanges(
  intended: Change[],
  actual: Change[],
  o: { strict?: boolean } = {},
): ChangeCheck {
  const meant = new Map(intended.map((c) => [changeKey(c.target), c]));
  const did = new Map(actual.map((c) => [changeKey(c.target), c]));
  const unexpected: Change[] = [];
  const missing: Change[] = [];
  const different: ChangeCheck['different'] = [];
  for (const [k, c] of did) {
    const m = meant.get(k);
    if (!m) unexpected.push(c);
    // An "add" that git sees as a change (the file was there already) is still what was meant.
    else if (m.op !== c.op && !(m.op !== 'delete' && c.op !== 'delete'))
      different.push({ target: c.target, meant: m.op, did: c.op });
  }
  if (o.strict !== false) for (const [k, c] of meant) if (!did.has(k)) missing.push(c);
  return {
    ok: !unexpected.length && !missing.length && !different.length,
    unexpected,
    missing,
    different,
  };
}

const list = (xs: string[]): string =>
  xs.slice(0, 5).join(', ') + (xs.length > 5 ? ` and ${xs.length - 5} more` : '');

/** A plain-words report of a mismatch, for the action history and the person. */
export function describeMismatch(job: string, c: ChangeCheck): string {
  if (c.ok) return `${job}: changes matched the plan.`;
  const parts: string[] = [];
  if (c.unexpected.length)
    parts.push(
      `changed things it didn't mean to (${list(c.unexpected.map((x) => `${x.target} ${opWord(x.op)}`))})`,
    );
  if (c.missing.length)
    parts.push(`didn't make planned changes (${list(c.missing.map((x) => x.target))})`);
  if (c.different.length)
    parts.push(
      `made changes differently from the plan (${list(
        c.different.map((x) => `${x.target}: ${opWord(x.did)} instead of ${opWord(x.meant)}`),
      )})`,
    );
  return `${job} stopped: it ${parts.join('; ')}.`;
}

const opWord = (op: ChangeOp): string =>
  op === 'add' ? 'added' : op === 'delete' ? 'deleted' : 'changed';

/** `git diff --cached --name-status` (or `git status --porcelain`) lines → changes.
 *  Renames count as a delete of the old path and an add of the new one. */
export function parseGitChanges(out: string): Change[] {
  const res: Change[] = [];
  for (const raw of out.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line) continue;
    const tab = line.split('\t');
    let code: string;
    let paths: string[];
    if (tab.length > 1) {
      code = (tab[0] ?? '').trim();
      paths = tab.slice(1);
    } else {
      // porcelain: "XY path" or "XY old -> new"
      code = line.slice(0, 2).trim();
      paths = line
        .slice(3)
        .split(' -> ')
        .map((p) => p.replace(/^"|"$/g, ''));
    }
    const c = code[0] ?? '';
    const first = paths[0] ?? '';
    const last = paths[paths.length - 1] ?? '';
    if (c === 'R' || c === 'C') {
      if (c === 'R') res.push({ target: first, op: 'delete' });
      res.push({ target: last, op: 'add' });
    } else if (c === 'A' || c === '?') res.push({ target: first, op: 'add' });
    else if (c === 'D') res.push({ target: first, op: 'delete' });
    else if (first) res.push({ target: first, op: 'modify' });
  }
  return res;
}

/** Ids before and after → changes (for stores like memories). */
export function idChanges(before: string[], after: string[]): Change[] {
  const b = new Set(before);
  const a = new Set(after);
  return [
    ...before.filter((x) => !a.has(x)).map((target) => ({ target, op: 'delete' as const })),
    ...after.filter((x) => !b.has(x)).map((target) => ({ target, op: 'add' as const })),
  ];
}
