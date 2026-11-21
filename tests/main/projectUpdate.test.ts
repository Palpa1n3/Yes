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
      'powershell.exe',
      'robocopy',
      'git',
      'git',
      'git',
    ]);
    expect(calls.slice(2)).toEqual([
      'git add -A',
      'git commit -m Alton 0.38.0 ; rm -rf',
      'git push',
    ]);
    expect(r.log).toMatch(/Pushed to GitHub/);
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
