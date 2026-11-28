import { describe, expect, it } from 'vitest';
import { diagnose, groupErrors, parseLogLine, signature } from '@shared/self-diagnosis';

const at = (iso: string): string => `${iso}`;
const line = (iso: string, level: string, where: string, text: string) =>
  parseLogLine(`${at(iso)} ${level} [${where}] ${text}`)!;

describe('Alton diagnosing itself', () => {
  it('reads log lines (with stack traces) and ignores anything else', () => {
    const l = parseLogLine(
      '2026-11-28T00:09:20.476Z ERROR [main] Uncaught: TypeError: x is undefined\n    at run (C:\\arc\\out\\main\\index.js:120:7)',
    );
    expect(l).toMatchObject({ level: 'ERROR', where: 'main' });
    expect(l?.text).toMatch(/at run/);
    expect(parseLogLine('hello')).toBeNull();
  });

  it('treats repeats with different ids, hashes and numbers as one problem', () => {
    expect(
      signature(
        "Loading the image 'blob:file:///0792e79d-68f4-44cd-b0c6-ebcfc67896d9' violates the policy (index-Dyy5_eZc.js:26224)",
      ),
    ).toBe(
      signature(
        "Loading the image 'blob:file:///028ca0ae-0a13-4ac4-8b4d-e377dcf0aa14' violates the policy (index-BbZd-yRi.js:26234)",
      ),
    );
    expect(signature('Timed out after 3000 ms')).toBe('Timed out after # ms');
  });

  it('groups, explains and ranks: serious first, and old ones marked fixed by the update', () => {
    const lines = [
      line(
        '2026-11-22T22:04:02.748Z',
        'ERROR',
        'ui',
        "Loading the image 'blob:file:///a' violates the following Content Security Policy directive",
      ),
      line(
        '2026-11-22T22:04:03.748Z',
        'ERROR',
        'ui',
        "Loading the image 'blob:file:///b' violates the following Content Security Policy directive",
      ),
      line(
        '2026-11-28T00:08:25.628Z',
        'WARN',
        'ui',
        'The ScriptProcessorNode is deprecated. (index-DluqXJ_F.js:26228)',
      ),
      line(
        '2026-11-28T00:31:52.455Z',
        'WARN',
        'ui',
        'The ScriptProcessorNode is deprecated. (index-BbZd-yRi.js:26234)',
      ),
      line(
        '2026-11-28T00:40:00.000Z',
        'ERROR',
        'main',
        'Uncaught: TypeError: x is undefined\n    at run (C:\\arc\\out\\main\\index.js:120:7)',
      ),
      line('2026-11-28T00:41:00.000Z', 'INFO', 'backup', 'Backed up'),
    ];
    const g = groupErrors(lines, Date.parse('2026-11-28T00:00:00Z'));
    expect(g.map((x) => [x.where, x.count, x.severity, !!x.fixedSinceUpdate])).toEqual([
      ['main', 1, 'high', false],
      ['ui', 2, 'low', false],
      ['ui', 2, 'medium', true],
    ]);
    expect(g[0]?.frame).toBe('C:\\arc\\out\\main\\index.js:120:7');
    expect(g[0]?.cause).toMatch(/unexpected crash/);
    expect(g[2]?.cause).toMatch(/security policy/);

    const d = diagnose({
      version: '1.0.0',
      lines,
      updatedAt: Date.parse('2026-11-28T00:00:00Z'),
      health: { ok: false, failed: ['ipc'] },
      crashes: 1,
    });
    expect(d.summary).toBe(
      'Alton 1.0.0: the start-up check failed (ipc), 1 crash recently, 1 serious problem in the log, plus 1 minor.',
    );
    expect(d.problems).toHaveLength(2);
    expect(d.probablyFixed).toHaveLength(1);
    expect(diagnose({ version: '1.0.0', lines: [] }).summary).toBe(
      'Alton 1.0.0 is working, with nothing wrong in the log.',
    );
  });
});
