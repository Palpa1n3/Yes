import { describe, expect, it } from 'vitest';
import {
  compareRuns,
  describeRun,
  newAgainstBaseline,
  parseVitestJson,
  type TestRun,
} from '@shared/regression';

const report = JSON.stringify({
  numTotalTests: 4,
  numPassedTests: 2,
  testResults: [
    {
      name: 'C:\\x\\arc\\tests\\lights.test.ts',
      status: 'failed',
      assertionResults: [
        { fullName: 'colours understands names', status: 'passed' },
        { fullName: 'colours picks devices', status: 'failed' },
      ],
    },
    { name: '/home/a/arc/tests/main/email.test.ts', status: 'failed', assertionResults: [] },
    {
      name: '/home/a/arc/tests/ok.test.ts',
      status: 'passed',
      assertionResults: [{ fullName: 'fine', status: 'passed' }],
    },
  ],
});

const run = (commit: string, failed: string[] | null, typecheck = true, lint = true): TestRun => ({
  at: 1,
  commit,
  typecheck,
  lint,
  tests: failed ? { total: 10, passed: 10 - failed.length, failed } : null,
});

describe('regression testing', () => {
  it('reads vitest’s report into failed tests by file', () => {
    expect(parseVitestJson(report)).toEqual({
      total: 4,
      passed: 2,
      failed: [
        'tests/lights.test.ts › colours picks devices',
        'tests/main/email.test.ts › (the file failed to load)',
      ],
    });
    expect(parseVitestJson('not json')).toBeNull();
    expect(parseVitestJson('{}')).toBeNull();
  });

  it('names what newly broke, what got fixed and what still fails', () => {
    const before = run('aaaaaaa111', ['t › old', 't › flaky']);
    const now = run('bbbbbbb222', ['t › old', 't › new'], true, false);
    const c = compareRuns(before, now);
    expect(c).toEqual({
      newFailures: ['t › new'],
      fixed: ['t › flaky'],
      stillFailing: ['t › old'],
      newlyBroken: ['Lint'],
    });
    expect(describeRun(before, now, c)).toBe(
      'Self-test of bbbbbbb: lint failed. Regression since aaaaaaa: Lint; t › new. Fixed since then: 1. Still failing: 1.',
    );
  });

  it('treats the first run as the baseline, and judges a changed copy against it', () => {
    const first = run('ccccccc', ['t › known']);
    expect(compareRuns(null, first)).toEqual({
      newFailures: [],
      fixed: [],
      stillFailing: ['t › known'],
      newlyBroken: [],
    });
    expect(describeRun(null, run('ddddddd', []), compareRuns(null, run('ddddddd', [])))).toBe(
      'Self-test of ddddddd: 10 of 10 tests passed.',
    );
    expect(newAgainstBaseline(first, ['t › known', 't › mine'])).toEqual(['t › mine']);
    expect(newAgainstBaseline(null, ['t › x'])).toEqual(['t › x']);
  });
});
