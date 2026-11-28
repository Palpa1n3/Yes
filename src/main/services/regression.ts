/** Daily self-test (Phase 3, item 5): a fresh copy of the project's last commit (its own
 *  DevSandbox, separate from the one chat uses), every check run in full, the result recorded
 *  test by test (userData/regression.json, last 30 runs) and compared with the run before.
 *  Only committed code runs, so no approval is needed; nothing in the project changes. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { compareRuns, describeRun, type RunComparison, type TestRun } from '@shared/regression';
import type { DevSandbox } from './dev-sandbox';

const DAY = 86_400_000;

export class RegressionWatch {
  private runs: TestRun[] = [];
  private running = false;

  constructor(
    private readonly d: {
      file?: string;
      sandbox(): DevSandbox;
      now?: () => number;
    },
  ) {
    try {
      if (d.file && existsSync(d.file)) {
        const j = JSON.parse(readFileSync(d.file, 'utf8')) as unknown;
        if (Array.isArray(j)) this.runs = j as TestRun[];
      }
    } catch {
      /* fresh */
    }
  }

  private now(): number {
    return this.d.now?.() ?? Date.now();
  }

  last(): TestRun | null {
    return this.runs.at(-1) ?? null;
  }

  /** A day since the last run (and not running now)? */
  due(): boolean {
    const l = this.last();
    return !this.running && (!l || this.now() - l.at >= DAY);
  }

  async run(): Promise<
    { run: TestRun; comparison: RunComparison; text: string } | { error: string }
  > {
    if (this.running) return { error: 'A self-test is already running.' };
    this.running = true;
    const sb = this.d.sandbox();
    try {
      const s = await sb.start();
      if (!s.ok) return { error: s.message };
      const r = await sb.check({ all: true });
      if ('error' in r) return r;
      const run: TestRun = {
        at: this.now(),
        commit: r.commit,
        typecheck: r.checks.find((c) => c.name === 'Typecheck')?.ok ?? false,
        lint: r.checks.find((c) => c.name === 'Lint')?.ok ?? false,
        tests: r.tests,
      };
      const before = this.last();
      const comparison = compareRuns(before, run);
      this.runs = [...this.runs, run].slice(-30);
      this.save();
      return { run, comparison, text: describeRun(before, run, comparison) };
    } finally {
      this.running = false;
      await sb.discard();
    }
  }

  private save(): void {
    if (!this.d.file) return;
    try {
      mkdirSync(dirname(this.d.file), { recursive: true });
      writeFileSync(`${this.d.file}.tmp`, JSON.stringify(this.runs));
      renameSync(`${this.d.file}.tmp`, this.d.file);
    } catch {
      /* not fatal */
    }
  }

  /** The self_test tool: the latest results, or a run now. */
  async tool(input: unknown, onResult?: (text: string, broke: boolean) => void): Promise<unknown> {
    const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    if (o.action === 'run') {
      const r = await this.run();
      if ('error' in r) return r;
      const broke = r.comparison.newFailures.length > 0 || r.comparison.newlyBroken.length > 0;
      onResult?.(r.text, broke);
      return { summary: r.text, ...r.comparison, commit: r.run.commit };
    }
    const last = this.last();
    if (!last)
      return { result: 'No self-test has run yet. Use action "run" (takes about a minute).' };
    const before = this.runs.at(-2) ?? null;
    const c = compareRuns(before, last);
    return {
      summary: describeRun(before, last, c),
      when: new Date(last.at).toLocaleString(),
      ...c,
      history: this.runs.slice(-7).map((x) => ({
        when: new Date(x.at).toLocaleDateString(),
        commit: x.commit.slice(0, 7),
        ok: x.typecheck && x.lint && !!x.tests && x.tests.failed.length === 0,
        failed: x.tests?.failed.length ?? null,
      })),
    };
  }
}
