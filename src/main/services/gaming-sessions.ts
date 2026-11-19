/** Gaming performance: while gaming mode is on, sample CPU/GPU load and temperatures every
 *  15 s; when it ends, keep a summary (last 30 sessions) for "how did my game run?". */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface PerfSample {
  cpu: number | null;
  cpuTemp: number | null;
  gpu: number | null;
  gpuTemp: number | null;
  memPct: number | null;
}

export interface GamingSession {
  game: string;
  start: number;
  minutes: number;
  cpu: { avg: number | null; max: number | null };
  cpuTemp: { avg: number | null; max: number | null };
  gpu: { avg: number | null; max: number | null };
  gpuTemp: { avg: number | null; max: number | null };
  memPct: { avg: number | null; max: number | null };
}

const stat = (xs: Array<number | null>): { avg: number | null; max: number | null } => {
  const v = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  if (!v.length) return { avg: null, max: null };
  return {
    avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length),
    max: Math.round(Math.max(...v)),
  };
};

export function summarise(
  game: string,
  start: number,
  end: number,
  s: PerfSample[],
): GamingSession {
  return {
    game,
    start,
    minutes: Math.round((end - start) / 60_000),
    cpu: stat(s.map((x) => x.cpu)),
    cpuTemp: stat(s.map((x) => x.cpuTemp)),
    gpu: stat(s.map((x) => x.gpu)),
    gpuTemp: stat(s.map((x) => x.gpuTemp)),
    memPct: stat(s.map((x) => x.memPct)),
  };
}

/** One spoken/written line about a finished session, with a warning if it ran hot. */
export function sessionLine(g: GamingSession): string {
  const parts: string[] = [];
  if (g.cpu.avg !== null) parts.push(`processor ${g.cpu.avg}% on average`);
  if (g.gpu.avg !== null) parts.push(`graphics ${g.gpu.avg}%`);
  if (g.gpuTemp.max !== null) parts.push(`graphics peaked at ${g.gpuTemp.max}°C`);
  if (g.cpuTemp.max !== null) parts.push(`processor peaked at ${g.cpuTemp.max}°C`);
  const hot = (g.gpuTemp.max ?? 0) >= 85 || (g.cpuTemp.max ?? 0) >= 90;
  const bottleneck =
    g.cpu.avg !== null && g.gpu.avg !== null && g.cpu.avg > 85 && g.gpu.avg < 60
      ? ' Your processor was the bottleneck; lowering CPU-heavy settings (view distance, crowds) or closing background apps may help.'
      : '';
  return `${g.game}: ${g.minutes} min${parts.length ? `, ${parts.join(', ')}` : ''}.${hot ? ' That is hot; check the fans and airflow.' : ''}${bottleneck}`;
}

export class GamingSessions {
  private list: GamingSession[] = [];
  private current: { game: string; start: number; samples: PerfSample[] } | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly d: {
      sample(): Promise<PerfSample>;
      file?: string;
      now?: () => number;
      everyMs?: number;
    },
  ) {
    try {
      if (d.file && existsSync(d.file)) {
        const raw = JSON.parse(readFileSync(d.file, 'utf8')) as unknown;
        if (Array.isArray(raw)) this.list = raw as GamingSession[];
      }
    } catch {
      /* fresh */
    }
  }

  private now(): number {
    return this.d.now?.() ?? Date.now();
  }

  start(game: string): void {
    if (this.current) return;
    this.current = { game, start: this.now(), samples: [] };
    this.timer = setInterval(() => void this.tick(), this.d.everyMs ?? 15_000);
  }

  async tick(): Promise<void> {
    if (!this.current) return;
    try {
      this.current.samples.push(await this.d.sample());
    } catch {
      /* skip */
    }
  }

  /** End the session; returns its summary if it lasted a few minutes. */
  end(): GamingSession | null {
    clearInterval(this.timer);
    const c = this.current;
    this.current = null;
    if (!c || this.now() - c.start < 3 * 60_000) return null;
    const s = summarise(c.game, c.start, this.now(), c.samples);
    this.list = [s, ...this.list].slice(0, 30);
    if (this.d.file)
      try {
        mkdirSync(dirname(this.d.file), { recursive: true });
        writeFileSync(`${this.d.file}.tmp`, JSON.stringify(this.list));
        renameSync(`${this.d.file}.tmp`, this.d.file);
      } catch {
        /* not fatal */
      }
    return s;
  }

  recent(): GamingSession[] {
    return this.list;
  }
}
