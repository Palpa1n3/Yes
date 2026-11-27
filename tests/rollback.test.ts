import { describe, expect, it } from 'vitest';
import { dashed, newerVersion, onBoot, parseLatestYml, type BootRecord } from '@shared/rollback';

describe('watching a new version start', () => {
  it('compares versions', () => {
    expect(newerVersion('0.81.0', '0.80.9')).toBe(true);
    expect(newerVersion('0.80.0', '0.81.0')).toBe(false);
    expect(newerVersion('1.0.0', '0.99.99')).toBe(true);
    expect(newerVersion('0.81.0', '0.81.0')).toBe(false);
  });

  it('remembers the version it was updated from', () => {
    let r = onBoot(null, '0.80.0', 1);
    expect(r.rec.from).toBeNull();
    r = onBoot({ ...r.rec, ok: true }, '0.81.0', 2);
    expect(r.rec).toMatchObject({ version: '0.81.0', from: '0.80.0', fails: 0, ok: false });
    expect(r.rollbackTo).toBeNull();
  });

  it('rolls back after two starts that never got going', () => {
    const start: BootRecord = {
      version: '0.81.0',
      from: '0.80.0',
      fails: 0,
      ok: false,
      at: 1,
      skip: [],
    };
    const second = onBoot(start, '0.81.0', 2);
    expect(second.rec.fails).toBe(1);
    expect(second.rollbackTo).toBeNull();
    const third = onBoot(second.rec, '0.81.0', 3);
    expect(third.rec.fails).toBe(2);
    expect(third.rollbackTo).toBe('0.80.0');
  });

  it('a start that ran fine resets the count', () => {
    const r = onBoot(
      { version: '0.81.0', from: '0.80.0', fails: 1, ok: true, at: 1, skip: [] },
      '0.81.0',
      2,
    );
    expect(r.rec.fails).toBe(0);
    expect(r.rollbackTo).toBeNull();
  });

  it('tries once per broken version, and never rolls back a fresh install', () => {
    const busy: BootRecord = {
      version: '0.81.0',
      from: '0.80.0',
      fails: 3,
      ok: false,
      at: 1,
      skip: [],
      rollingBackFrom: '0.81.0',
    };
    expect(onBoot(busy, '0.81.0', 2).rollbackTo).toBeNull();
    expect(
      onBoot({ ...busy, from: null, rollingBackFrom: null }, '0.81.0', 2).rollbackTo,
    ).toBeNull();
  });

  it('after rolling back, the old version has no "from" and keeps the skip list', () => {
    const r = onBoot(
      { version: '0.81.0', from: '0.80.0', fails: 2, ok: false, at: 1, skip: ['0.81.0'] },
      '0.80.0',
      2,
    );
    expect(r.rec).toMatchObject({ version: '0.80.0', from: null, skip: ['0.81.0'] });
  });
});

describe('the previous installer', () => {
  it('reads latest.yml', () => {
    const sha = 'a'.repeat(86) + '==';
    expect(
      parseLatestYml(
        `version: 0.80.0\nfiles:\n  - url: ARC-Setup-0.80.0.exe\n    sha512: ${sha}\n    size: 1\npath: ARC-Setup-0.80.0.exe\nsha512: ${sha}\nreleaseDate: '2026-11-27'\n`,
      ),
    ).toEqual({ path: 'ARC-Setup-0.80.0.exe', sha512: sha, version: '0.80.0' });
    expect(parseLatestYml('path: ../evil.sh\nsha512: x')).toBeNull();
    expect(dashed('0.81.0')).toBe('0-81-0');
  });
});
