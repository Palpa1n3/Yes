import { describe, expect, it } from 'vitest';
import { describeRecovery, lastSessionReport, type SessionRecord } from '@shared/session';

const rec = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  clean: false,
  startedAt: 1_000,
  lastAlive: 5_000,
  version: '0.84.0',
  work: {},
  ...over,
});
const time = (): string => '14:32';

describe('after a bad shutdown', () => {
  it('says nothing after a clean quit or a first start', () => {
    expect(lastSessionReport(null, 0)).toBeNull();
    expect(lastSessionReport(rec({ clean: true }), 9_000)).toBeNull();
  });

  it('tells a PC shutdown from Alton crashing', () => {
    // Windows started after the last heartbeat: the PC went off.
    expect(lastSessionReport(rec(), 9_000)?.kind).toBe('pc');
    // Windows has been up since before: Alton itself stopped.
    expect(lastSessionReport(rec(), 2_000)?.kind).toBe('alton');
  });

  it('names the interrupted work', () => {
    const r = lastSessionReport(
      rec({
        work: { agent: { task: 'tidy my desktop', step: 4, at: 4_000 }, research: ['monitors'] },
      }),
      9_000,
    );
    expect(r).toMatchObject({
      agent: { task: 'tidy my desktop', step: 4 },
      research: ['monitors'],
    });
    const text = describeRecovery(r!, time);
    expect(text).toMatch(/PC went off/);
    expect(text).toMatch(/step 4 of “tidy my desktop”/);
    expect(text).toMatch(/“monitors”/);
  });

  it('is calm when nothing was running', () => {
    const r = lastSessionReport(rec(), 2_000);
    expect(describeRecovery(r!, time)).toMatch(/Nothing was running/);
  });
});
