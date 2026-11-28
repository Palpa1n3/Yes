import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { DevSandbox } from '../../src/main/services/dev-sandbox';
import { RegressionWatch } from '../../src/main/services/regression';

/** A sandbox that "runs" scripted results. */
function fakeSandbox(results: Array<{ commit: string; failed: string[]; lint?: boolean }>) {
  let i = 0;
  const discard = vi.fn(async () => 'ok');
  const make = (): DevSandbox =>
    ({
      start: async () => ({ ok: true, message: '' }),
      check: async () => {
        const r = results[i++] ?? results.at(-1)!;
        return {
          ok: !r.failed.length && r.lint !== false,
          checks: [
            { name: 'Typecheck', ok: true, summary: '', ms: 1 },
            { name: 'Lint', ok: r.lint !== false, summary: '', ms: 1 },
            { name: 'Tests', ok: !r.failed.length, summary: '', ms: 1 },
          ],
          tests: { total: 5, passed: 5 - r.failed.length, failed: r.failed },
          commit: r.commit,
        };
      },
      discard,
    }) as unknown as DevSandbox;
  return { make, discard };
}

describe('the daily self-test', () => {
  it('records each run, reports a regression once something breaks, and keeps the history', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'arc-reg-')), 'regression.json');
    let now = 1_000;
    const sb = fakeSandbox([
      { commit: 'aaaaaaa1', failed: [] },
      { commit: 'bbbbbbb2', failed: ['tests/x.test.ts › breaks'] },
    ]);
    const w = new RegressionWatch({ file, sandbox: sb.make, now: () => now });
    expect(w.due()).toBe(true);
    const seen: Array<[string, boolean]> = [];
    await w.tool({ action: 'run' }, (t, broke) => seen.push([t, broke]));
    expect(w.due()).toBe(false);
    now += 86_400_000;
    expect(w.due()).toBe(true);
    const r = (await w.tool({ action: 'run' }, (t, broke) => seen.push([t, broke]))) as {
      newFailures: string[];
    };
    expect(r.newFailures).toEqual(['tests/x.test.ts › breaks']);
    expect(seen).toEqual([
      ['Self-test of aaaaaaa: 5 of 5 tests passed.', false],
      [
        'Self-test of bbbbbbb: 4 of 5 tests passed. Regression since aaaaaaa: tests/x.test.ts › breaks.',
        true,
      ],
    ]);
    // Every copy is thrown away afterwards.
    expect(sb.discard).toHaveBeenCalledTimes(2);
    // The history survives a restart.
    const again = new RegressionWatch({ file, sandbox: sb.make, now: () => now });
    expect(again.last()?.commit).toBe('bbbbbbb2');
    expect(await again.tool({ action: 'status' })).toMatchObject({
      summary: expect.stringMatching(/Regression since aaaaaaa/),
      history: [
        { commit: 'aaaaaaa', ok: true, failed: 0 },
        { commit: 'bbbbbbb', ok: false, failed: 1 },
      ],
    });
  });

  it('says when no self-test has run yet', async () => {
    const w = new RegressionWatch({ sandbox: fakeSandbox([]).make });
    expect(await w.tool({ action: 'status' })).toMatchObject({
      result: expect.stringMatching(/No self-test has run yet/),
    });
  });
});
