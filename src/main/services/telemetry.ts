/** Live telemetry. Each reading has its own cadence so expensive probes (process list,
 *  GPU, disks) don't run every tick, and everything stops while the window is hidden.
 *  The `si` source is injected so mapping and scheduling are testable. */
import os from 'node:os';
import type si from 'systeminformation';
import type { DiskStats, ProcessStats, SystemStats, TelemetryDetail } from '@shared/types';

export type SiSource = Pick<
  typeof si,
  | 'currentLoad'
  | 'mem'
  | 'networkInterfaceDefault'
  | 'networkInterfaces'
  | 'networkStats'
  | 'wifiConnections'
  | 'fsSize'
  | 'blockDevices'
  | 'graphics'
  | 'cpuTemperature'
  | 'cpuCurrentSpeed'
  | 'battery'
  | 'processes'
  | 'inetLatency'
>;

/** Milliseconds between refreshes of each reading. */
export const CADENCE = {
  fast: 2_000, // CPU, memory, throughput → also when stats are pushed
  medium: 10_000, // GPU, CPU temp, clock
  latency: 15_000,
  slow: 30_000, // disks, battery, interface
  processes: 5_000, // only while the System tab is open
} as const;

const PROCESS_COUNT = 10;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function mapDisks(
  fs: si.Systeminformation.FsSizeData[],
  blk: si.Systeminformation.BlockDevicesData[],
): DiskStats[] {
  const seen = new Set<string>();
  return (
    fs
      .filter((f) => f.size > 0 && f.mount && !seen.has(f.mount) && seen.add(f.mount))
      // Skip read-only system images / tiny virtual volumes.
      .filter((f) => f.rw !== false && f.size > 1024 ** 3)
      .map((f): DiskStats => {
        const b = blk.find((x) => x.mount === f.mount || x.name === f.fs || x.name === f.mount);
        const phys = (b?.physical ?? '').toLowerCase();
        const kind: DiskStats['kind'] =
          b?.removable || phys === 'removable'
            ? 'usb'
            : phys === 'network' || /^\\\\|^\/\/|nfs|cifs|smb/i.test(f.type)
              ? 'network'
              : phys === 'ssd'
                ? 'ssd'
                : phys === 'nvme'
                  ? 'nvme'
                  : phys === 'hdd'
                    ? 'hdd'
                    : 'local';
        return {
          id: f.mount,
          mount: f.mount,
          label: b?.label || (f.mount === '/' ? 'System' : f.mount),
          kind,
          size: f.size,
          used: f.used,
        };
      })
      .slice(0, 8)
  );
}

export function mapProcesses(list: si.Systeminformation.ProcessesProcessData[]): ProcessStats[] {
  return [...list]
    .filter((p) => p.pid > 0 && p.name && !/^(system idle process|idle)$/i.test(p.name))
    .sort((a, b) => b.cpu - a.cpu || b.memRss - a.memRss)
    .slice(0, PROCESS_COUNT)
    .map((p) => ({ pid: p.pid, name: p.name, cpu: Math.max(0, p.cpu), mem: p.memRss * 1024 }));
}

export function mapGpu(g: si.Systeminformation.GraphicsData): SystemStats['gpu'] {
  // Prefer the controller that reports utilisation, else the one with the most VRAM.
  const cs = [...g.controllers].sort(
    (a, b) =>
      (num(b.utilizationGpu) !== null ? 1 : 0) - (num(a.utilizationGpu) !== null ? 1 : 0) ||
      (b.vram ?? 0) - (a.vram ?? 0),
  );
  const c = cs[0];
  if (!c) return null;
  const mb = 1024 ** 2;
  const memTotal = num(c.memoryTotal) ?? num(c.vram);
  return {
    name: (c.model || c.name || 'GPU').replace(/^NVIDIA\s+/i, ''),
    load: num(c.utilizationGpu),
    memUsed: num(c.memoryUsed) !== null ? (c.memoryUsed as number) * mb : null,
    memTotal: memTotal !== null ? memTotal * mb : null,
    temp: num(c.temperatureGpu),
  };
}

export class TelemetryService {
  private stats: SystemStats;
  private timers: ReturnType<typeof setInterval>[] = [];
  private running = new Set<string>();
  private detail: TelemetryDetail = { processes: false };
  private active = false;
  private iface = '';

  /** Top processes, or null when only a baseline sample was taken (CPU% needs two). */
  private readonly readProcesses: () => Promise<ProcessStats[] | null>;

  constructor(
    private readonly si: SiSource,
    private readonly emit: (s: SystemStats) => void,
    /** Override the process source (Windows uses a faster reader than systeminformation). */
    readProcesses?: () => Promise<ProcessStats[] | null>,
  ) {
    this.readProcesses =
      readProcesses ?? (async () => mapProcesses((await this.si.processes()).list));
    const total = os.totalmem();
    this.stats = {
      cpu: {
        load: 0,
        cores: os.cpus().map(() => 0),
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

  snapshot(): SystemStats {
    return this.stats;
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Start (or resume) polling. Slow readings refresh immediately so a resumed window isn't stale. */
  start(): void {
    if (this.active) return;
    this.active = true;
    void this.refreshSlow().then(() => this.refreshMedium());
    void this.refreshLatency();
    void this.tick();
    this.timers = [
      setInterval(() => void this.tick(), CADENCE.fast),
      setInterval(() => void this.refreshMedium(), CADENCE.medium),
      setInterval(() => void this.refreshLatency(), CADENCE.latency),
      setInterval(() => void this.refreshSlow(), CADENCE.slow),
      setInterval(() => this.detail.processes && void this.refreshProcesses(), CADENCE.processes),
    ];
    if (this.detail.processes) void this.refreshProcesses();
  }

  /** Stop all polling (window hidden/minimised). */
  stop(): void {
    this.active = false;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  setDetail(detail: TelemetryDetail): void {
    const turnedOn = detail.processes && !this.detail.processes;
    this.detail = detail;
    if (turnedOn && this.active) void this.refreshProcesses();
    if (!detail.processes) this.patch({ processes: [] });
  }

  private patch(p: Partial<SystemStats>): void {
    this.stats = { ...this.stats, ...p };
  }

  /** Run a probe unless the previous run of the same probe is still in flight. */
  private async once(name: string, fn: () => Promise<void>): Promise<void> {
    if (this.running.has(name)) return;
    this.running.add(name);
    try {
      await fn();
    } catch {
      /* a failed probe keeps the last good value */
    } finally {
      this.running.delete(name);
    }
  }

  private tick(): Promise<void> {
    return this.once('fast', async () => {
      const [load, mem, net] = await Promise.all([
        this.si.currentLoad(),
        this.si.mem(),
        this.iface ? this.si.networkStats(this.iface) : Promise.resolve([]),
      ]);
      const n = net[0];
      this.patch({
        cpu: {
          ...this.stats.cpu,
          load: load.currentLoad,
          cores: load.cpus.map((c) => Math.round(c.load)),
        },
        // "active" excludes cache/buffers, matching what Task Manager calls "in use".
        memory: {
          used: mem.active,
          total: mem.total,
          swapUsed: mem.swapused,
          swapTotal: mem.swaptotal,
        },
        network: n
          ? {
              ...this.stats.network,
              down: Math.max(0, n.rx_sec ?? 0),
              up: Math.max(0, n.tx_sec ?? 0),
              rxTotal: n.rx_bytes,
              txTotal: n.tx_bytes,
            }
          : this.stats.network,
        uptime: os.uptime(),
        timestamp: Date.now(),
      });
      if (this.active) this.emit(this.stats);
    });
  }

  /* Temperature and battery are ACPI queries on Windows (WMI), which can hold the system up
     for a moment, a known cause of mouse stutter. Stop asking once they come back empty (most
     desktops have no battery; Windows rarely gives the CPU temperature without admin). */
  private tempTries = 0;
  private hasBattery: boolean | null = null;
  private slowRuns = 0;
  private blk: Awaited<ReturnType<SiSource['blockDevices']>> | null = null;

  private refreshMedium(): Promise<void> {
    return this.once('medium', async () => {
      const askTemp = this.tempTries < 2 || this.stats.cpu.temp !== null;
      const [gfx, temp, speed] = await Promise.all([
        this.si.graphics(),
        askTemp ? this.si.cpuTemperature() : Promise.resolve({ main: null }),
        this.si.cpuCurrentSpeed(),
      ]);
      if (askTemp && num(temp.main) === null) this.tempTries++;
      this.patch({
        gpu: mapGpu(gfx),
        cpu: {
          ...this.stats.cpu,
          temp: num(temp.main),
          speedGHz: num(speed.avg) || this.stats.cpu.speedGHz,
        },
      });
    });
  }

  private refreshLatency(): Promise<void> {
    return this.once('latency', async () => {
      const ms = await this.si.inetLatency('1.1.1.1');
      this.patch({ network: { ...this.stats.network, latencyMs: num(ms) } });
    });
  }

  private refreshSlow(): Promise<void> {
    return this.once('slow', async () => {
      // Disk models rarely change: every 10th run (5 min). Battery: until we know there's none.
      const run = this.slowRuns++;
      const [fs, blk, bat, def] = await Promise.all([
        this.si.fsSize(),
        this.blk && run % 10 !== 0 ? Promise.resolve(this.blk) : this.si.blockDevices(),
        this.hasBattery === false
          ? Promise.resolve({ hasBattery: false, percent: 0, isCharging: false })
          : this.si.battery(),
        this.si.networkInterfaceDefault(),
      ]);
      this.blk = blk;
      this.hasBattery = bat.hasBattery;
      this.iface = def;
      const ifaces = await this.si.networkInterfaces();
      const info = (Array.isArray(ifaces) ? ifaces : [ifaces]).find((i) => i.iface === def);
      const type =
        info?.type === 'wireless' ? 'wireless' : info?.type === 'wired' ? 'wired' : 'unknown';
      let ssid: string | null = null;
      if (type === 'wireless') ssid = (await this.si.wifiConnections())[0]?.ssid ?? null;
      this.patch({
        disks: mapDisks(fs, blk),
        battery: bat.hasBattery ? { percent: bat.percent, charging: bat.isCharging } : null,
        network: { ...this.stats.network, iface: info?.ifaceName || def, type, ssid },
      });
    });
  }

  /** One-off process sample for on-demand questions ("what's using my CPU?"), even when
   *  the System tab is closed. Per-process CPU is measured between two samples, so the
   *  first is taken early by warmProcesses(). Listing processes is slow on Windows (a WMI
   *  query), so the whole thing is time-boxed: on timeout the stats come back without
   *  processes rather than leaving the caller waiting. */
  async snapshotWithProcesses(
    timeoutMs = 5_000,
  ): Promise<SystemStats & { processesTimedOut?: boolean }> {
    const work = (async (): Promise<SystemStats> => {
      if (this.warming) await this.warming; // reuse an in-flight first sample
      const pause = (): Promise<void> => new Promise((r) => setTimeout(r, 1000));
      if (Date.now() - this.lastProcessSample > 15_000) {
        await this.readProcesses();
        await pause();
      }
      let list = await this.readProcesses();
      if (list === null) {
        // The reader had no baseline after all: one more short interval.
        await pause();
        list = await this.readProcesses();
      }
      this.lastProcessSample = Date.now();
      return { ...this.stats, processes: list ?? [] };
    })();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<SystemStats & { processesTimedOut: true }>((resolve) => {
      timer = setTimeout(
        () => resolve({ ...this.stats, processes: [], processesTimedOut: true }),
        timeoutMs,
      );
    });
    try {
      return await Promise.race([work, timeout]);
    } catch {
      return this.stats;
    } finally {
      clearTimeout(timer);
      work.catch(() => undefined); // a late finish is harmless
    }
  }

  /** Take the first process sample in the background (e.g. when a question is sent), so a
   *  following snapshotWithProcesses() only needs the second, fast-to-reach sample. */
  warmProcesses(): void {
    if (this.warming || Date.now() - this.lastProcessSample < 15_000) return;
    this.warming = this.readProcesses()
      .then(() => {
        this.lastProcessSample = Date.now();
      })
      .catch(() => undefined)
      .finally(() => {
        this.warming = null;
      });
  }

  private warming: Promise<void> | null = null;
  private lastProcessSample = 0;

  private refreshProcesses(): Promise<void> {
    return this.once('processes', async () => {
      const list = await this.readProcesses();
      this.lastProcessSample = Date.now();
      if (list && this.detail.processes) this.patch({ processes: list });
    });
  }
}
