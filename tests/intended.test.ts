import { describe, expect, it } from 'vitest';
import { compareChanges, describeMismatch, idChanges, parseGitChanges } from '@shared/intended';

describe('intended against actual changes', () => {
  it('passes when the changes match the plan (slashes and case aside)', () => {
    const c = compareChanges(
      [
        { target: 'src\\main\\a.ts', op: 'modify' },
        { target: 'docs/new.md', op: 'add' },
      ],
      [
        { target: 'src/main/A.ts', op: 'modify' },
        { target: './docs/new.md', op: 'modify' },
      ],
    );
    expect(c.ok).toBe(true);
  });

  it('catches changes nobody planned, planned ones that never happened, and deletes', () => {
    const c = compareChanges(
      [
        { target: 'a.ts', op: 'modify' },
        { target: 'b.ts', op: 'modify' },
        { target: 'c.ts', op: 'modify' },
      ],
      [
        { target: 'a.ts', op: 'modify' },
        { target: 'c.ts', op: 'delete' },
        { target: '.github/workflows/release.yml', op: 'modify' },
      ],
    );
    expect(c.ok).toBe(false);
    expect(c.unexpected).toEqual([{ target: '.github/workflows/release.yml', op: 'modify' }]);
    expect(c.missing).toEqual([{ target: 'b.ts', op: 'modify' }]);
    expect(c.different).toEqual([{ target: 'c.ts', meant: 'modify', did: 'delete' }]);
    expect(describeMismatch('The update', c)).toBe(
      "The update stopped: it changed things it didn't mean to (.github/workflows/release.yml changed); didn't make planned changes (b.ts); made changes differently from the plan (c.ts: deleted instead of changed).",
    );
    // Not strict: a planned file that came out the same isn't a problem.
    expect(compareChanges([{ target: 'b.ts', op: 'modify' }], [], { strict: false }).ok).toBe(true);
  });

  it('reads git’s change lists', () => {
    expect(parseGitChanges('M\tsrc/a.ts\nA\tdocs/b.md\nD\told.ts\nR100\tx.ts\ty.ts\n')).toEqual([
      { target: 'src/a.ts', op: 'modify' },
      { target: 'docs/b.md', op: 'add' },
      { target: 'old.ts', op: 'delete' },
      { target: 'x.ts', op: 'delete' },
      { target: 'y.ts', op: 'add' },
    ]);
    expect(parseGitChanges(' M src/a.ts\r\n?? notes.txt\r\n')).toEqual([
      { target: 'src/a.ts', op: 'modify' },
      { target: 'notes.txt', op: 'add' },
    ]);
    expect(parseGitChanges('')).toEqual([]);
  });

  it('turns ids before and after into changes', () => {
    expect(idChanges(['a', 'b', 'c'], ['a', 'd'])).toEqual([
      { target: 'b', op: 'delete' },
      { target: 'c', op: 'delete' },
      { target: 'd', op: 'add' },
    ]);
  });
});
