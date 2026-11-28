import { afterAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyProjectUpdate,
  cleanMessage,
  isAltonProject,
  type Run,
} from '../../src/main/services/project-update';

const dirs: string[] = [];
const project = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'arc-proj-'));
  dirs.push(d);
  mkdirSync(join(d, '.git'));
  writeFileSync(join(d, 'package.json'), JSON.stringify({ name: 'arc' }));
  return d;
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('update Alton from the phone', () => {
  it('only works on an Alton git folder', () => {
    expect(isAltonProject(project())).toBe(true);
    const other = mkdtempSync(join(tmpdir(), 'arc-proj-'));
    dirs.push(other);
    expect(isAltonProject(other)).toBe(false);
    expect(isAltonProject('')).toBe(false);
  });
  it('unpacks, copies, then git add / commit / push, and nothing else', async () => {
    const dir = project();
    const zip = join(dir, 'u.zip');
    writeFileSync(zip, 'x');
    const calls: string[] = [];
    const exec: Run = vi.fn(async (file, args, opts) => {
      calls.push(`${file} ${args[0] === '-NoProfile' ? 'expand' : args.join(' ')}`.slice(0, 40));
      if (file === 'powershell.exe') {
        const t = opts.env?.ARC_TMP as string;
        mkdirSync(join(t, 'arc'), { recursive: true });
        writeFileSync(join(t, 'arc', 'package.json'), JSON.stringify({ name: 'arc' }));
      }
      return {
        code: file === 'robocopy' ? 1 : 0,
        out: file === 'git' && args[0] === 'commit' ? '[main abc] msg' : '',
      };
    });
    const r = await applyProjectUpdate(zip, dir, 'Alton 0.38.0\n; rm -rf', exec);
    expect(r.ok).toBe(true);
    expect(calls.map((c) => c.split(' ')[0])).toEqual([
      'git',
      'powershell.exe',
      'robocopy',
      'git',
      'git',
      'git',
      'git',
    ]);
    expect([calls[0], ...calls.slice(3)]).toEqual([
      'git status --porcelain',
      'git add -A',
      'git diff --cached --name-status',
      'git commit -m Alton 0.38.0 ; rm -rf',
      'git push',
    ]);
    expect(r.log).toMatch(/Checked: only the planned files changed/);
    expect(r.log).toMatch(/Pushed to GitHub/);
  });

  it('won’t start when the project already has uncommitted changes', async () => {
    const dir = project();
    const zip = join(dir, 'u.zip');
    writeFileSync(zip, 'x');
    const exec: Run = vi.fn(async (_f, args) => ({
      code: 0,
      out: args[0] === 'status' ? ' M src/main/index.ts\n' : '',
    }));
    const r = await applyProjectUpdate(zip, dir, 'm', exec);
    expect(r.ok).toBe(false);
    expect(r.log).toMatch(/changes that aren’t committed yet \(src\/main\/index\.ts\)/);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('stops, unstages and pushes nothing when more changed than the zip meant to', async () => {
    const dir = project();
    writeFileSync(join(dir, 'same.ts'), 'old');
    const zip = join(dir, 'u.zip');
    writeFileSync(zip, 'x');
    const calls: string[] = [];
    const exec: Run = vi.fn(async (file, args, opts) => {
      calls.push(`${file} ${args.join(' ')}`);
      if (file === 'powershell.exe') {
        const t = opts.env?.ARC_TMP as string;
        mkdirSync(join(t, 'arc'), { recursive: true });
        writeFileSync(join(t, 'arc', 'package.json'), JSON.stringify({ name: 'arc' }));
        writeFileSync(join(t, 'arc', 'same.ts'), 'new');
      }
      if (file === 'git' && args[0] === 'diff')
        return { code: 0, out: 'M\tsame.ts\nD\tsrc/main/index.ts\n' };
      return { code: file === 'robocopy' ? 1 : 0, out: '' };
    });
    const r = await applyProjectUpdate(zip, dir, 'm', exec);
    expect(r.ok).toBe(false);
    expect(r.log).toMatch(/Planned: 1 file to add or change/);
    expect(r.log).toMatch(/changed things it didn't mean to \(src\/main\/index\.ts deleted\)/);
    expect(r.log).toMatch(/Nothing was committed or pushed/);
    expect(calls).toContain('git reset -q');
    expect(calls.some((c) => c.startsWith('git commit') || c.startsWith('git push'))).toBe(false);
  });
  it('refuses a zip that isn’t Alton, and cleans commit messages', async () => {
    const dir = project();
    const zip = join(dir, 'u.zip');
    writeFileSync(zip, 'x');
    const exec: Run = vi.fn(async () => ({ code: 0, out: '' }));
    const r = await applyProjectUpdate(zip, dir, 'm', exec);
    expect(r.ok).toBe(false);
    expect(r.log).toMatch(/isn’t an Alton project/);
    // Arguments never go through a shell; this just keeps messages tidy.
    expect(cleanMessage('hi `whoami` $(x)')).toBe('hi whoami (x)');
  });
});
