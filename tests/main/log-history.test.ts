import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ErrorLog } from '../../src/main/services/diagnostics';

describe('the whole error log, for self-diagnosis', () => {
  it('reads the old and current files, keeping stack traces with their entry', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arc-log-'));
    const file = join(dir, 'arc.log');
    writeFileSync(`${file}.old`, '2026-11-20T10:00:00.000Z WARN [ui] old one\n');
    writeFileSync(
      file,
      '2026-11-28T00:00:00.000Z ERROR [main] Uncaught: boom\n    at run (index.js:1:2)\r\n2026-11-28T00:01:00.000Z INFO [backup] ok\n',
    );
    expect(new ErrorLog(file).history()).toEqual([
      '2026-11-20T10:00:00.000Z WARN [ui] old one',
      '2026-11-28T00:00:00.000Z ERROR [main] Uncaught: boom\n    at run (index.js:1:2)',
      '2026-11-28T00:01:00.000Z INFO [backup] ok',
    ]);
    expect(new ErrorLog().history()).toEqual([]);
  });
});
