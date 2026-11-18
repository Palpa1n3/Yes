import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Systeminformation as S } from 'systeminformation';
import {
  CADENCE,
  TelemetryService,
  mapDisks,
  mapGpu,
  mapProcesses,
  type SiSource,
} from '../../src/main/services/telemetry';

const GB = 1024 ** 3;

function fakeSi() {
  const calls: Record<string, number> = {};
  const count =
    <T>(name: string, v: T) =>
    async () => {
      calls[name] = (calls[name] ?? 0) + 1;
      return v;
    };
  const src = {
    currentLoad: count('currentLoad', {
      currentLoad: 37.4,
      cpus: [{ load: 30.2 }, { load: 44.6 }],
    }),
    mem: count('mem', { active: 12 * GB, total: 32 * GB, swapused: GB, swaptotal: 8 * GB }),
    networkInterfaceDefault: count('iface', 'eth0'),
    networkInterfaces: count('ifaces', [{ iface: 'eth0', ifaceName: 'Ethernet', type: 'wired' }]),
    networkStats: count('net', [
      { rx_sec: 5_000_000, tx_sec: 250_000, rx_bytes: 9e9, tx_bytes: 1e9 },
    ]),
    wifiConnections: count('wifi', []),
    fsSize: count('fs', [
      { fs: 'C:', mount: 'C:', type: 'NTFS', size: 1000 * GB, used: 781 * GB, rw: true },
      { fs: 'D:', mount: 'D:', type: 'NTFS', size: 2000 * GB, used: 1822 * GB, rw: true },
    ]),
    blockDevices: count('blk', [
      { name: 'C:', mount: 'C:', physical: 'Local', label: 'Windows', removable: false },
      { name: 'D:', mount: 'D:', physical: 'Removable', label: 'Backup', removable: true },
    ]),
    graphics: count('gfx', {
      controllers: [
        {
          model: 'NVIDIA GeForce RTX 4070',
          vram: 12282,
          utilizationGpu: 23,
          memoryUsed: 3100,
          memoryTotal: 12282,
          temperatureGpu: 51,
        },
      ],
    }),
    cpuTemperature: count('temp', { main: null }),
    cpuCurrentSpeed: count('speed', { avg: 4.2 }),
    battery: count('bat', { hasBattery: false, percent: 0, isCharging: false }),
    processes: count('procs', {
      list: [
        { pid: 0, name: 'System Idle Process', cpu: 90, memRss: 8 },
        { pid: 11, name: 'chrome.exe', cpu: 7.5, memRss: 2_000_000 },
        { pid: 12, name: 'Code.exe', cpu: 12, memRss: 1_000_000 },
      ],
    }),
    inetLatency: count('ping', 14),
  } as unknown as SiSource;
  return { src, calls };
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('TelemetryService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('maps live readings into SystemStats and pushes every fast tick', async () => {
    const { src } = fakeSi();
    const emit = vi.fn();
    const t = new TelemetryService(src, emit);
    t.start();
    await vi.advanceTimersByTimeAsync(CADENCE.fast);
    const s = t.snapshot();
    expect(s.cpu).toMatchObject({ load: 37.4, cores: [30, 45], temp: null, speedGHz: 4.2 });
    expect(s.memory).toMatchObject({ used: 12 * GB, total: 32 * GB });
    expect(s.network).toMatchObject({
      down: 5_000_000,
      up: 250_000,
      iface: 'Ethernet',
      type: 'wired',
      latencyMs: 14,
      rxTotal: 9e9,
    });
    expect(s.gpu).toMatchObject({ name: 'GeForce RTX 4070', load: 23, temp: 51 });
    expect(s.disks.map((d) => [d.mount, d.kind, d.label])).toEqual([
      ['C:', 'local', 'Windows'],
      ['D:', 'usb', 'Backup'],
    ]);
    expect(s.battery).toBeNull();
    expect(emit).toHaveBeenCalled();
    t.stop();
  });

  it('runs expensive probes on their own, slower cadence', async () => {
    const { src, calls } = fakeSi();
    const t = new TelemetryService(src, vi.fn());
    t.start();
    await vi.advanceTimersByTimeAsync(CADENCE.slow);
    await flush();
    // ~15 fast ticks vs 2 disk scans in 30s.
    expect(calls['currentLoad']).toBeGreaterThanOrEqual(15);
    expect(calls['fs']).toBe(2);
    expect(calls['gfx']).toBeLessThanOrEqual(4);
    expect(calls['procs']).toBeUndefined(); // not requested
    t.stop();
  });

  it('only lists processes while asked to', async () => {
    const { src, calls } = fakeSi();
    const t = new TelemetryService(src, vi.fn());
    t.start();
    t.setDetail({ processes: true });
    await vi.advanceTimersByTimeAsync(CADENCE.processes);
    expect(t.snapshot().processes.map((p) => p.name)).toEqual(['Code.exe', 'chrome.exe']);
    const before = calls['procs'] ?? 0;
    t.setDetail({ processes: false });
    await vi.advanceTimersByTimeAsync(CADENCE.processes * 3);
    expect(calls['procs']).toBe(before);
    expect(t.snapshot().processes).toEqual([]);
    t.stop();
  });

  it('stops polling entirely when stopped (window hidden)', async () => {
    const { src, calls } = fakeSi();
    const emit = vi.fn();
    const t = new TelemetryService(src, emit);
    t.start();
    await vi.advanceTimersByTimeAsync(CADENCE.fast);
    t.stop();
    const n = calls['currentLoad'];
    emit.mockClear();
    await vi.advanceTimersByTimeAsync(CADENCE.slow * 2);
    expect(calls['currentLoad']).toBe(n);
    expect(emit).not.toHaveBeenCalled();
  });

  it('keeps the last good value when a probe throws', async () => {
    const { src } = fakeSi();
    const t = new TelemetryService(src, vi.fn());
    t.start();
    await vi.advanceTimersByTimeAsync(CADENCE.fast);
    (src as { mem: unknown }).mem = async () => {
      throw new Error('WMI hiccup');
    };
    await vi.advanceTimersByTimeAsync(CADENCE.fast * 2);
    expect(t.snapshot().memory.used).toBe(12 * GB);
    t.stop();
  });
});

describe('mappers', () => {
  it('mapProcesses skips the idle process and converts KB to bytes', () => {
    const list = [
      { pid: 0, name: 'System Idle Process', cpu: 95, memRss: 8 },
      { pid: 5, name: 'game.exe', cpu: 40, memRss: 4 },
    ] as S.ProcessesProcessData[];
    expect(mapProcesses(list)).toEqual([{ pid: 5, name: 'game.exe', cpu: 40, mem: 4096 }]);
  });

  it('mapGpu reports unknown load as null instead of 0', () => {
    const g = mapGpu({
      controllers: [{ model: 'AMD Radeon RX 7800 XT', vram: 16384, utilizationGpu: undefined }],
    } as unknown as S.GraphicsData);
    expect(g).toMatchObject({
      name: 'AMD Radeon RX 7800 XT',
      load: null,
      memUsed: null,
      memTotal: 16384 * 1024 ** 2,
    });
    expect(mapGpu({ controllers: [] } as unknown as S.GraphicsData)).toBeNull();
  });

  it('mapDisks drops tiny/read-only volumes and duplicates', () => {
    const fs = [
      { fs: '/dev/vda', mount: '/', type: 'ext4', size: 270 * GB, used: 10 * GB, rw: true },
      { fs: '/dev/vdc', mount: '/opt/x', type: 'ext4', size: 0.4 * GB, used: 0.3 * GB, rw: false },
      { fs: '/dev/vda', mount: '/', type: 'ext4', size: 270 * GB, used: 10 * GB, rw: true },
    ] as S.FsSizeData[];
    expect(mapDisks(fs, []).map((d) => [d.mount, d.label])).toEqual([['/', 'System']]);
  });
});

describe('on-demand process sample', () => {
  it('includes top processes even when the System tab is closed', async () => {
    vi.useFakeTimers();
    const { src, calls } = fakeSi();
    const t = new TelemetryService(src, vi.fn());
    const p = t.snapshotWithProcesses();
    await vi.advanceTimersByTimeAsync(1100);
    const s = await p;
    expect(s.processes.map((x) => x.name)).toEqual(['Code.exe', 'chrome.exe']);
    expect(calls['procs']).toBe(2); // a pair of samples for a CPU% delta
    expect(t.snapshot().processes).toEqual([]); // the live stream stays lean
    vi.useRealTimers();
  });
});

describe('slow process listing (Windows WMI)', () => {
  it('times out instead of leaving the caller waiting', async () => {
    vi.useFakeTimers();
    const { src } = fakeSi();
    (src as { processes: unknown }).processes = () => new Promise(() => undefined); // never returns
    const t = new TelemetryService(src, vi.fn());
    const p = t.snapshotWithProcesses(5000);
    await vi.advanceTimersByTimeAsync(5001);
    const s = await p;
    expect(s).toMatchObject({ processes: [], processesTimedOut: true });
    vi.useRealTimers();
  });

  it('a warm-up sample is reused, so the on-demand read needs only one more', async () => {
    vi.useFakeTimers();
    const { src, calls } = fakeSi();
    const t = new TelemetryService(src, vi.fn());
    t.warmProcesses();
    t.warmProcesses(); // second call is a no-op while warming
    await vi.advanceTimersByTimeAsync(0);
    const s = await t.snapshotWithProcesses();
    expect(calls['procs']).toBe(2); // warm-up + one more, no extra 1s pair
    expect(s.processes.length).toBeGreaterThan(0);
    vi.useRealTimers();
  });
});
