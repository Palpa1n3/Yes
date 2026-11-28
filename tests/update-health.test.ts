import { describe, expect, it } from 'vitest';
import {
  healthVerdict,
  missingChannels,
  parsesAsJson,
  rollBackNow,
  type HealthCheck,
} from '@shared/update-health';

const c = (id: string, ok: boolean, critical = true, detail?: string): HealthCheck => ({
  id,
  label: id,
  ok,
  critical,
  ...(detail ? { detail } : {}),
});

describe('health checks after starting', () => {
  it('passes when every critical check passes, even if a minor one fails', () => {
    const v = healthVerdict([c('data', true), c('phone', false, false, 'not running')], '1.0.0');
    expect(v.ok).toBe(true);
    expect(v.text).toBe("Health check for 1.0.0: the key parts work; phone (not running) didn't.");
    expect(healthVerdict([c('data', true)], '1.0.0').text).toBe(
      'Health check for 1.0.0: all 1 checks passed.',
    );
  });

  it('fails, saying what broke, when a critical check fails', () => {
    const v = healthVerdict(
      [c('data', true), c('ipc', false, true, 'missing chats:state')],
      '1.0.1',
    );
    expect(v.ok).toBe(false);
    expect(v.passed).toBe(1);
    expect(v.text).toBe(
      'Health check for 1.0.1: 1 of 2 passed. Not working: ipc (missing chats:state).',
    );
  });

  it('rolls back straight away on the last allowed failing start after an update', () => {
    const bad = healthVerdict([c('window', false)], '1.0.1');
    const good = healthVerdict([c('window', true)], '1.0.1');
    const rec = { from: '1.0.0', failsBefore: 1, version: '1.0.1' };
    expect(rollBackNow(rec, bad, 2)).toBe(true);
    // First failing start: wait for the next one.
    expect(rollBackNow({ ...rec, failsBefore: 0 }, bad, 2)).toBe(false);
    // Not after an update, already rolling back from it, or healthy: never.
    expect(rollBackNow({ ...rec, from: null }, bad, 2)).toBe(false);
    expect(rollBackNow({ ...rec, rollingBackFrom: '1.0.1' }, bad, 2)).toBe(false);
    expect(rollBackNow(rec, good, 2)).toBe(false);
  });

  it('reads saved files and finds missing channels', () => {
    expect(parsesAsJson('{"a":1}')).toBe(true);
    expect(parsesAsJson(`${String.fromCharCode(0xfeff)}{"a":1}`)).toBe(true);
    expect(parsesAsJson('{"a":')).toBe(false);
    expect(missingChannels(['a', 'b'], new Set(['a']))).toEqual(['b']);
  });
});
