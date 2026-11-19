/** PC health alerts: things worth a heads-up, with cool-downs so they don't nag. */
export interface HealthSample {
  now: number;
  cpuTemp: number | null;
  gpuTemp: number | null;
  /** 0–100 */
  memPct: number | null;
  disks: Array<{ mount: string; pct: number }>;
  battery: { percent: number; charging: boolean } | null;
  uptimeSec: number;
}

export interface HealthAlert {
  id: string;
  text: string;
}

export interface HealthRule {
  id: string;
  /** How long the condition must hold before alerting. */
  sustainMs: number;
  cooldownMs: number;
  check(s: HealthSample): string | null;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

export const HEALTH_RULES: HealthRule[] = [
  {
    id: 'cpu-hot',
    sustainMs: MIN,
    cooldownMs: 30 * MIN,
    check: (s) =>
      s.cpuTemp !== null && s.cpuTemp >= 90
        ? `Your processor is running very hot (${Math.round(s.cpuTemp)}°C). Check the fans and airflow.`
        : null,
  },
  {
    id: 'gpu-hot',
    sustainMs: MIN,
    cooldownMs: 30 * MIN,
    check: (s) =>
      s.gpuTemp !== null && s.gpuTemp >= 85
        ? `Your graphics card is running hot (${Math.round(s.gpuTemp)}°C).`
        : null,
  },
  {
    id: 'memory',
    sustainMs: 2 * MIN,
    cooldownMs: HOUR,
    check: (s) =>
      s.memPct !== null && s.memPct >= 92
        ? `Memory is ${Math.round(s.memPct)}% full, which can slow things down. The Tasks tab shows what's using it.`
        : null,
  },
  {
    id: 'disk',
    sustainMs: 0,
    cooldownMs: 12 * HOUR,
    check: (s) => {
      const full = s.disks.filter((d) => d.pct >= 95).sort((a, b) => b.pct - a.pct)[0];
      return full
        ? `Drive ${full.mount} is ${Math.round(full.pct)}% full. Say “free up space” and I'll find what can go.`
        : null;
    },
  },
  {
    id: 'battery',
    sustainMs: 0,
    cooldownMs: HOUR,
    check: (s) =>
      s.battery && !s.battery.charging && s.battery.percent <= 15
        ? `Battery is at ${Math.round(s.battery.percent)}%. Plug in soon.`
        : null,
  },
  {
    id: 'uptime',
    sustainMs: 0,
    cooldownMs: 24 * HOUR,
    check: (s) => {
      const days = Math.floor(s.uptimeSec / 86_400);
      return days >= 7
        ? `Your PC hasn't restarted in ${days} days. A restart clears out slowdowns and finishes updates.`
        : null;
    },
  },
];

/** Tracks how long each problem has lasted and when it last alerted. */
export class HealthMonitor {
  private since = new Map<string, number>();
  private lastAlert = new Map<string, number>();
  constructor(private readonly rules: HealthRule[] = HEALTH_RULES) {}

  check(s: HealthSample): HealthAlert[] {
    const out: HealthAlert[] = [];
    for (const r of this.rules) {
      const text = r.check(s);
      if (!text) {
        this.since.delete(r.id);
        continue;
      }
      const start = this.since.get(r.id) ?? s.now;
      this.since.set(r.id, start);
      const last = this.lastAlert.get(r.id) ?? -Infinity;
      if (s.now - start >= r.sustainMs && s.now - last >= r.cooldownMs) {
        this.lastAlert.set(r.id, s.now);
        out.push({ id: r.id, text });
      }
    }
    return out;
  }
}
