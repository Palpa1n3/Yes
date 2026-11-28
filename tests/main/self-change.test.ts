import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DevSandbox } from '../../src/main/services/dev-sandbox';
import { run, type Run } from '../../src/main/services/project-update';
import { SELF_CHANGE_PREFIX, SelfChange } from '../../src/main/services/self-change';

/** File text with Windows line endings evened out (git may convert them). */
const readText = (p: string): string =>
  readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A real throwaway Alton git project. */
function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'arc-real-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@example.test');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'arc' }));
  mkdirSync(join(dir, 'src', 'shared'), { recursive: true });
  writeFileSync(join(dir, 'src', 'shared', 'a.ts'), 'export const a = 1;\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'start');
  return dir;
}

/** Real git; the npm checks are faked (they'd take minutes), writing a passing test report. */
function setup(approveAnswers: boolean[] = [true, true, true, true], failTests = false) {
  const proj = project();
  const root = mkdtempSync(join(tmpdir(), 'arc-sbx-'));
  const exec: Run = async (file, args, opts) => {
    if (file === 'cmd.exe') {
      const cmd = args.at(-1) ?? '';
      const m = /--outputFile="([^"]+)"/.exec(cmd);
      if (m?.[1])
        writeFileSync(
          m[1],
          JSON.stringify({
            numTotalTests: 2,
            numPassedTests: failTests ? 1 : 2,
            testResults: [
              {
                name: join(proj, 'tests', 'a.test.ts'),
                status: failTests ? 'failed' : 'passed',
                assertionResults: [
                  { fullName: 'a works', status: failTests ? 'failed' : 'passed' },
                  { fullName: 'b works', status: 'passed' },
                ],
              },
            ],
          }),
        );
      return { code: failTests && m ? 1 : 0, out: 'ok' };
    }
    return run(file, args, opts);
  };
  const answers = [...approveAnswers];
  const approve = vi.fn<(title: string, detail: string) => Promise<boolean>>(
    async () => answers.shift() ?? false,
  );
  const sandbox = new DevSandbox({ root, projectDir: () => proj, approve, exec });
  const audit = vi.fn();
  const change = new SelfChange({ sandbox, projectDir: () => proj, approve, exec, audit });
  return { proj, sandbox, change, approve, audit };
}

describe('approved changes from the development copy into the real project', () => {
  it('applies a checked change after approval, verifies it, commits it, and can undo it', async () => {
    const { proj, sandbox, change, approve } = setup();
    await sandbox.start();
    sandbox.edit('src/shared/a.ts', '1', '2');
    sandbox.write('src/shared/b.ts', 'export const b = 3;\n');
    // Not checked yet: refused.
    expect(await change.tool({ action: 'apply', message: 'x' })).toMatchObject({
      ok: false,
      message: expect.stringMatching(/Run "check" after the last change/),
    });
    await sandbox.tool({ action: 'check' });
    const r = (await change.tool({ action: 'apply', message: 'Make a two' })) as {
      ok: boolean;
      commit: string;
    };
    expect(r).toMatchObject({ ok: true });
    expect(readText(join(proj, 'src', 'shared', 'a.ts'))).toBe('export const a = 2;\n');
    expect(readText(join(proj, 'src', 'shared', 'b.ts'))).toBe('export const b = 3;\n');
    expect(git(proj, 'log', '-1', '--format=%s')).toBe(`${SELF_CHANGE_PREFIX}Make a two`);
    expect(git(proj, 'status', '--porcelain')).toBe('');
    // Approvals: running the changed code, then applying it.
    expect(approve.mock.calls.map((c) => c[0])).toEqual([
      'Let Alton run its checks on its changed copy?',
      "Apply Alton's change to your project? Make a two",
    ]);
    // The copy is gone once applied.
    expect(sandbox.current()).toBeNull();

    // Pushing asks again (this test repo has no remote, so git itself fails).
    expect(await change.tool({ action: 'push' })).toMatchObject({
      ok: false,
      message: expect.stringMatching(/git push failed/),
    });
    expect(approve).toHaveBeenCalledTimes(3);

    // Undo: a new commit that reverses it.
    expect(await change.tool({ action: 'revert' })).toMatchObject({ ok: true });
    expect(readText(join(proj, 'src', 'shared', 'a.ts'))).toBe('export const a = 1;\n');
    expect(git(proj, 'log', '-1', '--format=%s')).toMatch(
      /^Revert "Alton self-change: Make a two"/,
    );
    // The latest commit is now the revert, not a self-change: nothing more to undo.
    expect(await change.tool({ action: 'revert' })).toMatchObject({ ok: false });
  });

  it('refuses when the project has your own uncommitted work, or moved on, or you say no', async () => {
    const a = setup();
    await a.sandbox.start();
    a.sandbox.edit('src/shared/a.ts', '1', '2');
    await a.sandbox.tool({ action: 'check' });
    writeFileSync(join(a.proj, 'src', 'shared', 'mine.ts'), '// my own work\n');
    expect(await a.change.apply('x')).toMatchObject({
      ok: false,
      message: expect.stringMatching(/aren’t committed yet/),
    });
    git(a.proj, 'add', '-A');
    git(a.proj, 'commit', '-q', '-m', 'my work');
    expect(await a.change.apply('x')).toMatchObject({
      ok: false,
      message: expect.stringMatching(/moved on/),
    });

    const no = setup([true, false]);
    await no.sandbox.start();
    no.sandbox.edit('src/shared/a.ts', '1', '2');
    await no.sandbox.tool({ action: 'check' });
    expect(await no.change.apply('x')).toMatchObject({
      ok: false,
      message: expect.stringMatching(/said no/),
    });
    expect(readText(join(no.proj, 'src', 'shared', 'a.ts'))).toBe('export const a = 1;\n');
    expect(git(no.proj, 'log', '--format=%s')).toBe('start');
  });

  it('won’t apply a change whose tests newly fail', async () => {
    const f = setup([true, true], true);
    await f.sandbox.start();
    f.sandbox.edit('src/shared/a.ts', '1', '2');
    await f.sandbox.tool({ action: 'check' });
    expect(await f.change.apply('x')).toMatchObject({
      ok: false,
      message: expect.stringMatching(/New test failures: tests\/a\.test\.ts › a works/),
    });
  });
});
