import { describe, expect, it } from 'vitest';
import { applyEdit, blockedPath, checkSummary } from '@shared/sandbox-rules';
import { riskyTool } from '@shared/tool-guard';

describe('what Alton may change in its development copy', () => {
  it('allows source, tests and notes', () => {
    for (const p of [
      'src/main/services/email.ts',
      'src\\shared\\usage.ts',
      'tests/main/email.test.ts',
      'phone/src/main.ts',
      'ROADMAP.md',
      'src/renderer/styles/app.css',
    ])
      expect(blockedPath(p)).toBeNull();
  });

  it('refuses dependencies, build and release setup, git, secrets and anything outside', () => {
    for (const p of [
      'package.json',
      'package-lock.json',
      '.npmrc',
      '.github/workflows/release.yml',
      'scripts/ensure-electron.cjs',
      'android/app/build.gradle',
      'electron-builder.yml',
      'vitest.config.ts',
      'tsconfig.json',
      'node_modules/x/index.js',
      '.git/config',
      'src/.env',
      'src/main/secret-store.key',
      '../outside.ts',
      'C:/Windows/x.ts',
      '/etc/x.ts',
      'random/file.ts',
      'src/main/run.exe',
      '',
    ])
      expect(blockedPath(p), p).not.toBeNull();
  });

  it('edits only text that appears exactly once', () => {
    expect(applyEdit('a b c', 'b', 'B')).toEqual({ text: 'a B c' });
    expect(applyEdit('a b b', 'b', 'B')).toMatchObject({
      error: expect.stringMatching(/more than once/),
    });
    expect(applyEdit('a', 'z', 'B')).toMatchObject({
      error: expect.stringMatching(/isn't in the file/),
    });
    expect(applyEdit('a', '', 'B')).toMatchObject({ error: 'Nothing to find.' });
  });

  it('keeps the useful part of a check’s output, and running checks counts as risky after outside content', () => {
    const out = ['ok 1', 'ok 2', 'src/a.ts(3,1): error TS2304: Cannot find name x', 'done'].join(
      '\n',
    );
    expect(checkSummary(out)).toBe('src/a.ts(3,1): error TS2304: Cannot find name x');
    expect(checkSummary('all good\nfine')).toBe('all good\nfine');
    expect(riskyTool('dev_sandbox', { action: 'check' })).toBe('run tests on its changed code');
    expect(riskyTool('dev_sandbox', { action: 'edit' })).toBeNull();
  });
});
