import { describe, expect, it, vi } from 'vitest';
import { looksSecret } from '@shared/clipboard';
import { HealthMonitor, type HealthSample } from '@shared/health';
import { ClipboardHistory } from '../../src/main/services/clipboard-history';

describe('clipboard history', () => {
  it('spots passwords and keys', () => {
    for (const s of ['Hunter2!Secure', 'sk-ant-api03-abcdefghijklmnop', 'P@ssw0rd123'])
      expect(looksSecret(s)).toBe(true);
    for (const s of [
      'hello world',
      'https://amazon.co.uk/dp/B0B5ZR6M3X',
      'milk',
      'Order #12345 confirmed',
    ])
      expect(looksSecret(s)).toBe(false);
  });

  it('records new copies, newest first, and can copy one back', async () => {
    let clip = 'already there';
    const write = vi.fn((t: string) => (clip = t));
    const onChange = vi.fn();
    const h = new ClipboardHistory({ read: () => clip, write, enabled: () => true, onChange });
    await h.start(60_000);
    await h.poll();
    expect(h.list()).toEqual([]); // what was there at start isn't new
    clip = 'first link';
    await h.poll();
    clip = 'Secr3t!pass';
    await h.poll();
    clip = 'first link';
    await h.poll();
    expect(h.list().map((i) => i.text)).toEqual(['first link', 'Secr3t!pass']);
    expect(h.forModel()).toEqual([{ copied: expect.any(String), text: 'first link' }]); // secret hidden
    const secret = h.list()[1]!;
    expect(h.copy(secret.id)).toBe(true);
    expect(write).toHaveBeenCalledWith('Secr3t!pass');
    await h.poll();
    expect(h.list()).toHaveLength(2); // copying back isn't recorded again
    h.stop();
  });

  it('does nothing when switched off', async () => {
    const h = new ClipboardHistory({
      read: () => 'x',
      write: () => undefined,
      enabled: () => false,
      onChange: () => undefined,
    });
    await h.poll();
    expect(h.list()).toEqual([]);
  });
});

describe('PC health alerts', () => {
  const base: HealthSample = {
    now: 0,
    cpuTemp: 60,
    gpuTemp: 60,
    memPct: 50,
    disks: [{ mount: 'C:', pct: 70 }],
    battery: null,
    uptimeSec: 3600,
  };

  it('alerts after a problem lasts, then waits before repeating', () => {
    const m = new HealthMonitor();
    expect(m.check({ ...base, cpuTemp: 95 })).toEqual([]); // just started
    expect(m.check({ ...base, now: 61_000, cpuTemp: 96 }).map((a) => a.id)).toEqual(['cpu-hot']);
    expect(m.check({ ...base, now: 120_000, cpuTemp: 96 })).toEqual([]); // cooling down
    expect(m.check({ ...base, now: 200_000 })).toEqual([]); // fixed
  });

  it('full drives, low battery and long uptime alert straight away', () => {
    const m = new HealthMonitor();
    const alerts = m.check({
      ...base,
      disks: [{ mount: 'C:', pct: 96.4 }],
      battery: { percent: 12, charging: false },
      uptimeSec: 9 * 86_400,
    });
    expect(alerts.map((a) => a.id)).toEqual(['disk', 'battery', 'uptime']);
    expect(alerts[0]!.text).toMatch(/C: is 96% full/);
    expect(m.check({ ...base, now: 1000, disks: [{ mount: 'C:', pct: 97 }] })).toEqual([]);
  });

  it('stays quiet when temperatures are unknown', () => {
    expect(
      new HealthMonitor().check({ ...base, cpuTemp: null, gpuTemp: null, memPct: null }),
    ).toEqual([]);
  });
});
