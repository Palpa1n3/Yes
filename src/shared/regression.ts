/** Automated regression testing (Phase 3, item 5): each run of Alton's own checks is recorded,
 *  test by test, and compared with the run before, so a test that used to pass and now fails
 *  (a regression) is spotted and named, with the versions it happened between. Pure; tested in
 *  tests/regression.test.ts. */

export interface TestRun {
  at: number;
  /** The commit that was tested. */
  commit: string;
  typecheck: boolean;
  lint: boolean;
  /** null when the tests didn't run (an earlier check failed). */
  tests: { total: number; passed: number; failed: string[] } | null;
}

/** Vitest's JSON report → totals and the failed tests' names ("file › test"). */
export function parseVitestJson(
  text: string,
): { total: number; passed: number; failed: string[] } | null {
  let j: {
    numTotalTests?: number;
    numPassedTests?: number;
    testResults?: Array<{
      name?: string;
      status?: string;
      message?: string;
      assertionResults?: Array<{ fullName?: string; status?: string }>;
    }>;
  };
  try {
    j = JSON.parse(text) as typeof j;
  } catch {
    return null;
  }
  if (typeof j.numTotalTests !== 'number') return null;
  const failed: string[] = [];
  for (const f of j.testResults ?? []) {
    const file = (f.name ?? '').replace(/\\/g, '/').replace(/^.*?\/(tests\/)/, '$1');
    const bad = (f.assertionResults ?? []).filter((a) => a.status === 'failed');
    for (const a of bad) failed.push(`${file} › ${a.fullName ?? '?'}`);
    // A file that couldn't even load has no test results: count the file itself.
    if (f.status === 'failed' && !bad.length) failed.push(`${file} › (the file failed to load)`);
  }
  return { total: j.numTotalTests, passed: j.numPassedTests ?? 0, failed: failed.slice(0, 200) };
}

export interface RunComparison {
  /** Passed (or ran fine) before, fails now. */
  newFailures: string[];
  /** Failed before, passes now. */
  fixed: string[];
  stillFailing: string[];
  /** Typecheck or lint went from passing to failing. */
  newlyBroken: string[];
}

export function compareRuns(before: TestRun | null, now: TestRun): RunComparison {
  const was = new Set(before?.tests?.failed ?? []);
  const is = new Set(now.tests?.failed ?? []);
  const newlyBroken: string[] = [];
  if (before?.typecheck && !now.typecheck) newlyBroken.push('Typecheck');
  if (before?.lint && !now.lint) newlyBroken.push('Lint');
  // Without an earlier run, nothing counts as "new" (it's the baseline).
  if (!before?.tests) return { newFailures: [], fixed: [], stillFailing: [...is], newlyBroken };
  return {
    newFailures: [...is].filter((t) => !was.has(t)),
    fixed: [...was].filter((t) => !is.has(t)),
    stillFailing: [...is].filter((t) => was.has(t)),
    newlyBroken,
  };
}

const short = (c: string): string => c.slice(0, 7) || '?';

/** One line for the person (and the error log, when something broke). */
export function describeRun(before: TestRun | null, now: TestRun, c: RunComparison): string {
  const t = now.tests;
  const head = `Self-test of ${short(now.commit)}: ${
    !now.typecheck
      ? 'the typecheck failed'
      : !now.lint
        ? 'lint failed'
        : t
          ? `${t.passed} of ${t.total} tests passed`
          : 'tests did not run'
  }.`;
  const parts: string[] = [];
  if (c.newlyBroken.length || c.newFailures.length)
    parts.push(
      `Regression since ${before ? short(before.commit) : 'last time'}: ${[
        ...c.newlyBroken,
        ...c.newFailures.slice(0, 5),
      ].join('; ')}${c.newFailures.length > 5 ? ` and ${c.newFailures.length - 5} more` : ''}.`,
    );
  if (c.fixed.length) parts.push(`Fixed since then: ${c.fixed.length}.`);
  if (c.stillFailing.length) parts.push(`Still failing: ${c.stillFailing.length}.`);
  return [head, ...parts].join(' ');
}

/** A changed copy judged against the last run: only failures that weren't there already count. */
export function newAgainstBaseline(baseline: TestRun | null, failed: string[]): string[] {
  const known = new Set(baseline?.tests?.failed ?? []);
  return failed.filter((f) => !known.has(f));
}
