import os from 'node:os';
import type { SystemInfo, SystemStats } from '@shared/types';

function osName(): string {
  const p = process.platform;
  if (p === 'win32') {
    const build = Number(os.release().split('.')[2] ?? 0);
    return build >= 22000 ? 'Windows 11' : 'Windows 10';
  }
  if (p === 'darwin') return 'macOS';
  if (p === 'linux') return 'Linux';
  return p;
}

export function info(): SystemInfo {
  const cpus = os.cpus();
  return {
    hostname: os.hostname(),
    username: os.userInfo().username,
    platform: process.platform,
    osName: osName(),
    osRelease: os.release(),
    arch: os.arch(),
    cpuModel: cpus[0]?.model.trim() ?? 'Unknown CPU',
    cpuThreads: cpus.length,
    memTotal: os.totalmem(),
  };
}

/** Per-core load from the delta between two os.cpus() samples. */
let lastTimes = os.cpus().map((c) => c.times);
function coreLoads(): number[] {
  const now = os.cpus().map((c) => c.times);
  const loads = now.map((t, i) => {
    const p = lastTimes[i] ?? t;
    const idle = t.idle - p.idle;
    const total =
      t.user + t.nice + t.sys + t.irq + t.idle - (p.user + p.nice + p.sys + p.irq + p.idle);
    return total > 0 ? Math.round((1 - idle / total) * 100) : 0;
  });
  lastTimes = now;
  return loads;
}

/** Stage 2: a basic snapshot from `os` (CPU, memory, uptime). Stage 5 replaces this
 *  with the systeminformation-backed service (GPU, disks, network, processes, temps). */
export function snapshot(): SystemStats {
  const total = os.totalmem();
  const cores = coreLoads();
  return {
    cpu: {
      load: cores.length ? Math.round(cores.reduce((a, b) => a + b, 0) / cores.length) : 0,
      cores,
      speedGHz: (os.cpus()[0]?.speed ?? 0) / 1000,
      temp: null,
    },
    memory: { used: total - os.freemem(), total, swapUsed: 0, swapTotal: 0 },
    gpu: null,
    network: {
      up: 0,
      down: 0,
      iface: '',
      type: 'unknown',
      ssid: null,
      latencyMs: null,
      rxTotal: 0,
      txTotal: 0,
    },
    disks: [],
    processes: [],
    battery: null,
    uptime: os.uptime(),
    timestamp: Date.now(),
  };
}
