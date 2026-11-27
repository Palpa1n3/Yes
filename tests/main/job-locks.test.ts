import { describe, expect, it } from 'vitest';
import { JobLocks } from '../../src/main/services/job-locks';

describe('stopping automated jobs clashing', () => {
  it('lets one job have Vortex at a time and says who has it', () => {
    const l = new JobLocks();
    const a = l.take(['vortex'], 'Updating mods');
    expect('release' in a).toBe(true);
    const b = l.take(['vortex', 'cyberpunk-files'], 'Vortex sync');
    expect(b).toEqual({ waitingFor: 'Updating mods is using Vortex' });
    // All or nothing: the files weren't taken by the job that had to wait.
    expect(l.holder('cyberpunk-files')).toBeNull();
    if ('release' in a) a.release();
    expect('release' in l.take(['vortex'], 'Vortex sync')).toBe(true);
  });

  it('frees a hold left by a job that never finished', () => {
    let now = 0;
    const l = new JobLocks(() => now);
    l.take(['input'], 'Agent Mode', 1000);
    now = 2000;
    expect(l.holder('input')).toBeNull();
    expect(l.busy()).toEqual([]);
  });

  it('runs a job and releases afterwards, even when it fails', async () => {
    const l = new JobLocks();
    await expect(
      l.run(['input'], 'Press Deploy', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(l.holder('input')).toBeNull();
    const r = await l.run(['input'], 'Press Deploy', async () => 42);
    expect(r).toEqual({ ran: true, value: 42 });
  });

  it('lets the same job take it again (one step calling another)', () => {
    const l = new JobLocks();
    const outer = l.take(['cyberpunk-files'], 'Cyberpunk mod tools');
    const inner = l.take(['cyberpunk-files'], 'Cyberpunk mod tools');
    expect('release' in inner).toBe(true);
    if ('release' in inner) inner.release();
    // The outer job still holds it.
    expect(l.holder('cyberpunk-files')).toBe('Cyberpunk mod tools');
    if ('release' in outer) outer.release();
    expect(l.holder('cyberpunk-files')).toBeNull();
  });

  it('lists what is busy', () => {
    const l = new JobLocks();
    l.take(['input'], 'Agent Mode');
    expect(l.busy()).toEqual([{ resource: 'input', label: 'Agent Mode' }]);
  });
});
