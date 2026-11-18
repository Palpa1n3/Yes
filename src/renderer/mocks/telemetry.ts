/** Mock telemetry (SystemStats-shaped). The app uses live data since Stage 5; this remains
 *  for tests and for previewing the UI without Electron. */
import type { DiskStats, ProcessStats, SystemStats } from '@shared/types';

const GB = 1024 ** 3;
const MB = 1024 ** 2;

const walk = (v: number, step: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v + (Math.random() - 0.5) * 2 * step));

const DISKS: DiskStats[] = [
  { id: 'c', mount: 'C:', label: 'System', kind: 'nvme', size: 1000 * GB, used: 781 * GB },
  { id: 'd', mount: 'D:', label: 'Games', kind: 'ssd', size: 2000 * GB, used: 1822 * GB },
  { id: 'e', mount: 'E:', label: 'Archive', kind: 'hdd', size: 4000 * GB, used: 2104 * GB },
  { id: 'f', mount: 'F:', label: 'USB Stick', kind: 'usb', size: 64 * GB, used: 9 * GB },
];

const PROCS: Array<Omit<ProcessStats, 'cpu' | 'mem'> & { cpu: number; mem: number }> = [
  { pid: 4812, name: 'chrome.exe', cpu: 9, mem: 2.1 * GB },
  { pid: 10344, name: 'Code.exe', cpu: 6, mem: 1.2 * GB },
  { pid: 7720, name: 'Discord.exe', cpu: 3, mem: 610 * MB },
  { pid: 9152, name: 'Spotify.exe', cpu: 2, mem: 380 * MB },
  { pid: 1288, name: 'explorer.exe', cpu: 1, mem: 210 * MB },
  { pid: 6640, name: 'steamwebhelper.exe', cpu: 1, mem: 450 * MB },
  { pid: 3016, name: 'MsMpEng.exe', cpu: 2, mem: 300 * MB },
  { pid: 11420, name: 'obs64.exe', cpu: 4, mem: 520 * MB },
];

export function createMockTelemetry(threads = 16): () => SystemStats {
  let cores = Array.from({ length: threads }, () => 10 + Math.random() * 25);
  let mem = 18.6 * GB;
  let gpu = 22;
  let gpuMem = 3.1 * GB;
  let down = 4.2 * MB;
  let up = 0.6 * MB;
  let latency = 14;
  let cpuTemp = 54;
  let gpuTemp = 48;
  let procs = PROCS.map((p) => ({ ...p }));
  const bootedAt = Date.now() - (3 * 86400 + 4 * 3600 + 17 * 60) * 1000;

  return () => {
    cores = cores.map((c) => walk(c, 9, 2, 96));
    const load = cores.reduce((a, b) => a + b, 0) / cores.length;
    mem = walk(mem, 0.3 * GB, 14 * GB, 27 * GB);
    gpu = walk(gpu, 8, 3, 97);
    gpuMem = walk(gpuMem, 0.15 * GB, 1.5 * GB, 7.5 * GB);
    down = walk(down, 3 * MB, 0.05 * MB, 48 * MB);
    up = walk(up, 0.4 * MB, 0.01 * MB, 6 * MB);
    latency = walk(latency, 3, 8, 42);
    cpuTemp = walk(cpuTemp, 2, 42, 82) * 0.8 + (45 + load * 0.4) * 0.2;
    gpuTemp = walk(gpuTemp, 2, 38, 80) * 0.8 + (40 + gpu * 0.4) * 0.2;
    procs = procs.map((p) => ({
      ...p,
      cpu: walk(p.cpu, 2, 0, 35),
      mem: walk(p.mem, 30 * MB, 80 * MB, 3 * GB),
    }));

    return {
      cpu: { load, cores: cores.map(Math.round), speedGHz: 3.6 + load / 100, temp: cpuTemp },
      memory: { used: mem, total: 32 * GB, swapUsed: 1.4 * GB, swapTotal: 8 * GB },
      gpu: {
        name: 'GeForce RTX 4070',
        load: gpu,
        memUsed: gpuMem,
        memTotal: 12 * GB,
        temp: gpuTemp,
      },
      network: {
        up,
        down,
        iface: 'Ethernet',
        type: 'wired',
        ssid: null,
        latencyMs: latency,
        rxTotal: 14.2 * GB,
        txTotal: 1.1 * GB,
      },
      disks: DISKS,
      processes: [...procs].sort((a, b) => b.cpu - a.cpu),
      battery: null,
      uptime: (Date.now() - bootedAt) / 1000,
      timestamp: Date.now(),
    };
  };
}
