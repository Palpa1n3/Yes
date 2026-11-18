/** Fast per-app CPU on Windows. systeminformation's process list goes through a WMI
 *  query that can take well over 5 s; Get-Process returns in a fraction of that. It
 *  reports cumulative CPU seconds, so CPU% comes from the change between two samples,
 *  and helper processes are grouped by name (Chrome's 20+ processes become one row). */
import { execFile } from 'node:child_process';
import os from 'node:os';
import type { ProcessStats } from '@shared/types';

export interface RawProc {
  pid: number;
  name: string;
  cpuSec: number; // cumulative CPU time
  mem: number; // working set, bytes
  /** Has a visible main window (an "app" in Task Manager terms). */
  window?: boolean;
  responding?: boolean;
}

const SCRIPT =
  '[Console]::OutputEncoding=[Text.Encoding]::UTF8;' +
  'Get-Process | ForEach-Object { [pscustomobject]@{i=$_.Id;n=$_.ProcessName;c=$_.CPU;m=$_.WorkingSet64;w=[int]($_.MainWindowHandle -ne 0);r=[int][bool]$_.Responding} } | ConvertTo-Json -Compress';

export function sampleWindowsProcesses(timeoutMs = 8_000): Promise<RawProc[]> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err);
        try {
          resolve(parseSample(stdout));
        } catch (e) {
          reject(e);
        }
      },
    );
  });
}

export function parseSample(json: string): RawProc[] {
  const raw: unknown = JSON.parse(json || '[]');
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .filter(
      (x): x is { i: number; n: string; c: number | null; m: number; w?: number; r?: number } =>
        !!x && typeof x.i === 'number' && typeof x.n === 'string',
    )
    .map((x) => ({
      pid: x.i,
      name: x.n,
      cpuSec: typeof x.c === 'number' ? x.c : 0,
      mem: typeof x.m === 'number' ? x.m : 0,
      ...(typeof x.w === 'number' ? { window: x.w === 1 } : {}),
      ...(typeof x.r === 'number' ? { responding: x.r === 1 } : {}),
    }));
}

/** CPU% per app between two samples, grouped by name, highest first. */
export function cpuBetween(
  prev: RawProc[],
  cur: RawProc[],
  elapsedSec: number,
  threads = os.cpus().length,
  limit = 10,
): ProcessStats[] {
  const before = new Map(prev.map((p) => [p.pid, p.cpuSec]));
  const groups = new Map<string, ProcessStats & { count: number }>();
  for (const p of cur) {
    if (p.pid === 0 || /^idle$/i.test(p.name)) continue;
    const delta = Math.max(0, p.cpuSec - (before.get(p.pid) ?? p.cpuSec));
    // Task Manager style: share of the whole machine (all threads).
    const pct = elapsedSec > 0 ? (delta / elapsedSec / Math.max(1, threads)) * 100 : 0;
    const g = groups.get(p.name);
    if (g) {
      g.cpu += pct;
      g.mem += p.mem;
      g.count += 1;
    } else groups.set(p.name, { pid: p.pid, name: p.name, cpu: pct, mem: p.mem, count: 1 });
  }
  return [...groups.values()]
    .sort((a, b) => b.cpu - a.cpu || b.mem - a.mem)
    .slice(0, limit)
    .map((g) => ({ ...g, cpu: Math.round(g.cpu * 10) / 10 }));
}

/** Keeps the previous sample; returns null when there's no recent baseline yet. */
export class WinProcessReader {
  private prev: { at: number; list: RawProc[] } | null = null;

  constructor(private readonly sample: () => Promise<RawProc[]> = sampleWindowsProcesses) {}

  read = async (): Promise<ProcessStats[] | null> => {
    const list = await this.sample();
    const at = Date.now();
    const prev = this.prev;
    this.prev = { at, list };
    if (!prev || at - prev.at > 60_000) return null;
    return cpuBetween(prev.list, list, (at - prev.at) / 1000);
  };
}
