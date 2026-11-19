import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ShiftStore } from '../../src/main/services/shift-store';

describe('shifts synced to the PC', () => {
  const long = { title: 'Long', start: '2026-11-20T07:00', end: '2026-11-20T17:00' };
  const short = { title: 'Short', start: '2026-11-21T09:00', end: '2026-11-21T13:00' };
  it('the PC keeps synced shifts and tells Claude about the next two weeks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arc-sh-'));
    const store = new ShiftStore(join(dir, 'shifts.json'));
    const now = new Date(2026, 10, 19, 12);
    expect(store.merge([long, short, { start: 'bad' }], now)).toBe(2);
    expect(store.summary(now)).toContain('Fri 20 Nov 07:00–17:00 (10h) Long');
    const again = new ShiftStore(join(dir, 'shifts.json'));
    expect(again.upcoming(now)).toHaveLength(2);
    expect(again.summary(new Date(2026, 11, 25))).toBe('');
  });
});
