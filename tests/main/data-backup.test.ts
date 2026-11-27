import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DataBackup, keepPlan, readableJson } from '../../src/main/services/data-backup';

let dir = '';
let clock = new Date(2026, 10, 27, 12, 0, 0);
const make = (): DataBackup => new DataBackup(dir, () => clock);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'alton-backup-'));
  clock = new Date(2026, 10, 27, 12, 0, 0);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('backups of Alton’s data', () => {
  it('copies the data files and records which ones are readable', () => {
    writeFileSync(join(dir, 'settings.json'), '{"a":1}');
    writeFileSync(join(dir, 'shifts.json'), '{"broken"');
    writeFileSync(join(dir, 'anthropic-key.bin'), 'secret');
    const b = make().backup();
    expect(b?.name).toBe('2026-11-27');
    expect(b?.damaged).toEqual(['shifts.json']);
    const files = readdirSync(join(dir, 'backups', '2026-11-27'));
    expect(files).toContain('settings.json');
    expect(files).not.toContain('anthropic-key.bin');
  });

  it('makes safe names for extra backups (e.g. before an update)', () => {
    writeFileSync(join(dir, 'settings.json'), '{}');
    expect(make().backup('before-update-0.81.0')?.name).toBe('2026-11-27-before-update-0-81-0');
  });

  it('puts back a damaged file from the newest good backup at start-up', () => {
    writeFileSync(join(dir, 'notes.json'), '{"notes":["old"]}');
    make().backup();
    clock = new Date(2026, 10, 28, 12, 0, 0);
    writeFileSync(join(dir, 'notes.json'), '{"notes":["bro');
    make().backup(); // this one holds the damaged copy
    writeFileSync(join(dir, 'notes.json'), '');
    const fixed = make().recoverDamaged();
    expect(fixed).toEqual([{ file: 'notes.json', from: '2026-11-27' }]);
    expect(JSON.parse(readFileSync(join(dir, 'notes.json'), 'utf8'))).toEqual({ notes: ['old'] });
    expect(readdirSync(dir).some((f) => f.startsWith('notes.json.damaged-'))).toBe(true);
  });

  it('leaves readable and missing files alone', () => {
    writeFileSync(join(dir, 'settings.json'), '{}');
    expect(make().recoverDamaged()).toEqual([]);
    expect(readableJson(join(dir, 'nope.json'))).toBe(true);
  });

  it('never restores a copy that was damaged when backed up', () => {
    writeFileSync(join(dir, 'apps.json'), '[1]');
    writeFileSync(join(dir, 'settings.json'), '{broken');
    make().backup();
    writeFileSync(join(dir, 'settings.json'), '{"now":true}');
    writeFileSync(join(dir, 'apps.json'), '[2]');
    expect(make().restore('2026-11-27')).toBe(true);
    expect(readFileSync(join(dir, 'settings.json'), 'utf8')).toBe('{"now":true}');
    expect(readFileSync(join(dir, 'apps.json'), 'utf8')).toBe('[1]');
    expect(existsSync(join(dir, 'backups', '2026-11-27-before-restore'))).toBe(true);
  });
});

describe('which backups are kept', () => {
  it('keeps a week of daily backups, then one a week for four weeks', () => {
    const day = 86_400_000;
    const start = new Date(2026, 10, 27).getTime();
    const list = Array.from({ length: 60 }, (_, i) => ({
      name: `d${i}`,
      at: start - i * day,
    }));
    const keep = keepPlan(list);
    expect(keep.size).toBe(11);
    for (let i = 0; i < 7; i++) expect(keep.has(`d${i}`)).toBe(true);
    expect(keep.has('d59')).toBe(false);
  });
});
