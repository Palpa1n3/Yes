import { describe, expect, it, vi } from 'vitest';
import {
  WinProcessReader,
  cpuBetween,
  parseSample,
  type RawProc,
} from '../../src/main/services/win-processes';
import { TelemetryService, type SiSource } from '../../src/main/services/telemetry';

const GB = 1024 ** 3;

describe('Windows process reader', () => {
  it('parses Get-Process JSON (array or single object, null CPU for protected processes)', () => {
    expect(
      parseSample(
        '[{"i":4,"n":"System","c":null,"m":1024},{"i":10,"n":"chrome","c":12.5,"m":2048}]',
      ),
    ).toEqual([
      { pid: 4, name: 'System', cpuSec: 0, mem: 1024 },
      { pid: 10, name: 'chrome', cpuSec: 12.5, mem: 2048 },
    ]);
    expect(parseSample('{"i":1,"n":"x","c":1,"m":2}')).toHaveLength(1);
  });

  it('computes Task-Manager-style CPU% between samples and groups helpers by name', () => {
    const a: RawProc[] = [
      { pid: 1, name: 'chrome', cpuSec: 10, mem: GB },
      { pid: 2, name: 'chrome', cpuSec: 5, mem: GB },
      { pid: 3, name: 'Code', cpuSec: 50, mem: GB },
      { pid: 0, name: 'Idle', cpuSec: 999, mem: 0 },
    ];
    const b: RawProc[] = [
      { pid: 1, name: 'chrome', cpuSec: 11.6, mem: GB },
      { pid: 2, name: 'chrome', cpuSec: 5.0, mem: GB },
      { pid: 3, name: 'Code', cpuSec: 50.8, mem: GB },
      { pid: 4, name: 'new', cpuSec: 3, mem: 0 }, // started between samples: no baseline, 0%
      { pid: 0, name: 'Idle', cpuSec: 1015, mem: 0 },
    ];
    // 2 s elapsed on a 4-thread machine: chrome used 1.6 s → 1.6/2/4 = 20%.
    const top = cpuBetween(a, b, 2, 4);
    expect(top[0]).toMatchObject({ name: 'chrome', cpu: 20, count: 2, mem: 2 * GB });
    expect(top[1]).toMatchObject({ name: 'Code', cpu: 10, count: 1 });
    expect(top.find((p) => p.name === 'Idle')).toBeUndefined();
    expect(top.find((p) => p.name === 'new')?.cpu).toBe(0);
  });

  it('returns null until it has a baseline, then real percentages', async () => {
    let t = 0;
    const samples: RawProc[][] = [
      [{ pid: 1, name: 'game', cpuSec: 0, mem: 0 }],
      [{ pid: 1, name: 'game', cpuSec: 8, mem: 0 }],
    ];
    const reader = new WinProcessReader(async () => samples[t++] ?? []);
    expect(await reader.read()).toBeNull();
    const second = await reader.read();
    expect(second?.[0]?.name).toBe('game');
  });

  it('telemetry takes a second sample when the reader only had a baseline', async () => {
    vi.useFakeTimers();
    const read = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue([{ pid: 1, name: 'game', cpu: 40, mem: 0 }]);
    const t = new TelemetryService({} as SiSource, vi.fn(), read);
    const p = t.snapshotWithProcesses();
    await vi.advanceTimersByTimeAsync(2100);
    expect((await p).processes[0]).toMatchObject({ name: 'game', cpu: 40 });
    expect(read).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
