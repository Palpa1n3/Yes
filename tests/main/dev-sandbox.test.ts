import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DevSandbox } from '../../src/main/services/dev-sandbox';
import type { Run } from '../../src/main/services/project-update';

/** A fake Alton project and a fake "git clone" (a plain copy) so nothing real runs. */
function setup(approve = vi.fn(async () => true), checkCodes: number[] = [0, 0, 0]) {
  const project = mkdtempSync(join(tmpdir(), 'arc-proj-'));
  mkdirSync(join(project, '.git'));
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'arc' }));
  mkdirSync(join(project, 'src', 'shared'), { recursive: true });
  writeFileSync(join(project, 'src', 'shared', 'a.ts'), 'export const a = 1;\n');
  mkdirSync(join(project, 'node_modules', 'typescript'), { recursive: true });
  writeFileSync(join(project, 'node_modules', 'typescript', 'keep.txt'), 'keep');
  const root = mkdtempSync(join(tmpdir(), 'arc-sbx-'));
  const calls: string[] = [];
  let check = 0;
  const exec: Run = vi.fn(async (file, args, opts) => {
    calls.push(`${file} ${args.join(' ')}`);
    if (file === 'git' && args[0] === 'clone') {
      cpSync(project, args.at(-1) ?? '', {
        recursive: true,
        filter: (s) => !s.includes('node_modules'),
      });
      return { code: 0, out: '' };
    }
    if (file === 'cmd.exe') {
      const code = checkCodes[check++] ?? 0;
      return { code, out: code ? 'src/shared/a.ts(1,1): error TS2322: nope' : 'ok' };
    }
    if (file === 'git' && args.includes('--stat'))
      return { code: 0, out: ' src/shared/a.ts | 2 +-' };
    void opts;
    return { code: 0, out: '' };
  });
  const sb = new DevSandbox({ root, projectDir: () => project, approve, exec });
  return { sb, project, root, calls, approve };
}

describe('Alton’s development copy', () => {
  it('changes only the copy, asks once before running checks, and runs fixed commands', async () => {
    const { sb, project, calls, approve } = setup();
    expect((await sb.tool({ action: 'start' })) as { ok: boolean }).toMatchObject({ ok: true });
    const dir = sb.current() ?? '';
    expect(
      await sb.tool({ action: 'edit', path: 'src/shared/a.ts', find: '1', replace: '2' }),
    ).toEqual({
      result: 'Changed src/shared/a.ts in the copy.',
    });
    expect(readFileSync(join(dir, 'src', 'shared', 'a.ts'), 'utf8')).toBe('export const a = 2;\n');
    // The real project is untouched.
    expect(readFileSync(join(project, 'src', 'shared', 'a.ts'), 'utf8')).toBe(
      'export const a = 1;\n',
    );
    expect(
      await sb.tool({ action: 'write', path: '.github/workflows/x.yml', content: 'x' }),
    ).toMatchObject({
      error: expect.stringMatching(/release/),
    });

    const r = (await sb.tool({ action: 'check' })) as {
      ok: boolean;
      checks: Array<{ name: string }>;
    };
    expect(r.ok).toBe(true);
    expect(r.checks.map((c) => c.name)).toEqual(['Typecheck', 'Lint', 'Tests']);
    expect(approve).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c.startsWith('cmd.exe'))).toEqual([
      'cmd.exe /d /s /c npm run -s typecheck',
      'cmd.exe /d /s /c npx eslint .',
      'cmd.exe /d /s /c npx vitest run',
    ]);
    await sb.tool({ action: 'check' });
    expect(approve).toHaveBeenCalledTimes(1);

    expect(await sb.tool({ action: 'diff' })).toMatchObject({
      stat: ' src/shared/a.ts | 2 +-',
      changed: ['src/shared/a.ts'],
    });
    expect(await sb.tool({ action: 'discard' })).toEqual({
      result: 'Threw away the development copy.',
    });
    expect(existsSync(dir)).toBe(false);
    // The project's dependencies survive throwing the copy (and its link) away.
    expect(existsSync(join(project, 'node_modules', 'typescript', 'keep.txt'))).toBe(true);
  });

  it('stops at the first failing check, and runs nothing if the user says no', async () => {
    const failing = setup(
      vi.fn(async () => true),
      [0, 1, 0],
    );
    await failing.sb.start();
    const r = (await failing.sb.check()) as {
      ok: boolean;
      checks: Array<{ name: string; ok: boolean; summary: string }>;
    };
    expect(r.ok).toBe(false);
    expect(r.checks.map((c) => [c.name, c.ok])).toEqual([
      ['Typecheck', true],
      ['Lint', false],
    ]);
    expect(r.checks[1]?.summary).toMatch(/TS2322/);

    const no = setup(vi.fn(async () => false));
    await no.sb.start();
    expect(await no.sb.check()).toEqual({ error: "The user didn't allow running the checks." });
    expect(no.calls.some((c) => c.startsWith('cmd.exe'))).toBe(false);
  });

  it('needs an Alton project, and a copy before anything else', async () => {
    const sb = new DevSandbox({
      root: mkdtempSync(join(tmpdir(), 'arc-sbx-')),
      projectDir: () => '',
      approve: async () => true,
    });
    expect(await sb.tool({ action: 'start' })).toMatchObject({ ok: false });
    expect(
      await sb.tool({ action: 'edit', path: 'src/a.ts', find: 'a', replace: 'b' }),
    ).toMatchObject({
      error: expect.stringMatching(/start/),
    });
  });
});
