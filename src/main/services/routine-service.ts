/** Saved routines (userData/routines.json) and the runner. One routine runs at a time;
 *  action steps go through the normal command executor, `say` / `briefing` steps are
 *  handed to the renderer to show (and speak) as ARC's reply. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { toCommand, type CanonicalCommand, type CommandResult } from '@shared/commands';
import {
  DEFAULT_ROUTINES,
  MAX_ROUTINES,
  MAX_WAIT_S,
  describeStep,
  isToday,
  scheduleMatches,
  newRoutineId,
  sanitizeRoutine,
  sanitizeRoutines,
  stepIntent,
  stepProblem,
  type Routine,
} from '@shared/routines';
import type { RoutineProgress } from '@shared/types';

export interface RoutineServiceDeps {
  file?: string;
  now?: () => number;
  execute(cmd: CanonicalCommand): Promise<CommandResult>;
  briefing(): string;
  onChange(list: Routine[]): void;
  onProgress(p: RoutineProgress): void;
  sleep?(ms: number, signal: AbortSignal): Promise<void>;
}

const defaultSleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
  });

export class RoutineService {
  private routines: Routine[] = [];
  private running: { id: string; abort: AbortController } | null = null;
  private readonly now: () => number;

  constructor(private readonly d: RoutineServiceDeps) {
    this.now = d.now ?? Date.now;
  }

  load(): void {
    let raw: unknown = null;
    try {
      if (this.d.file && existsSync(this.d.file))
        raw = JSON.parse(readFileSync(this.d.file, 'utf8'));
    } catch {
      raw = null;
    }
    // First run (or an unreadable file): start with the examples.
    this.routines = raw === null ? structuredClone(DEFAULT_ROUTINES) : sanitizeRoutines(raw);
    if (raw === null) this.save();
  }

  list(): Routine[] {
    return structuredClone(this.routines);
  }

  runningId(): string | null {
    return this.running?.id ?? null;
  }

  /** Create or update; a new routine (unknown or missing id) gets a fresh id. */
  upsert(raw: unknown): Routine[] {
    const r = sanitizeRoutine(raw);
    if (!r) throw new Error('A routine needs a name.');
    const i = this.routines.findIndex((x) => x.id === (raw as { id?: unknown }).id);
    const old = this.routines[i];
    if (old) {
      r.id = old.id;
      if (old.lastRun && !r.lastRun) r.lastRun = old.lastRun;
      this.routines[i] = r;
    } else {
      if (this.routines.length >= MAX_ROUTINES)
        throw new Error(`You can have up to ${MAX_ROUTINES} routines.`);
      r.id = newRoutineId(r.name, new Set(this.routines.map((x) => x.id)));
      delete r.lastRun;
      this.routines.push(r);
    }
    this.changed();
    return this.list();
  }

  remove(id: string): Routine[] {
    this.routines = this.routines.filter((r) => r.id !== id);
    this.changed();
    return this.list();
  }

  /** Routines whose schedule is this minute and that haven't just run. */
  dueNow(): Routine[] {
    const now = this.now();
    const d = new Date(now);
    return this.routines.filter(
      (r) =>
        r.schedule &&
        scheduleMatches(r.schedule, d) &&
        !(r.lastRun && now - r.lastRun < 90_000) &&
        this.running?.id !== r.id,
    );
  }

  /** Routines set to run at startup that haven't run today. */
  dueAtStartup(): Routine[] {
    const now = this.now();
    return this.routines.filter((r) => r.runAtStartup && !isToday(r.lastRun, now));
  }

  stop(): void {
    this.running?.abort.abort();
  }

  /** Run every step in order. A failed step is reported and the rest still run. */
  async run(id: string, commandId = `rtn-${this.now()}`): Promise<CommandResult> {
    const done = (status: CommandResult['status'], message: string): CommandResult => ({
      commandId,
      status,
      message,
      timestamp: this.now(),
    });
    const r = this.routines.find((x) => x.id === id);
    if (!r) return done('failed', "That routine doesn't exist any more.");
    if (this.running)
      return done('failed', 'Another routine is still running. Wait for it or stop it first.');
    if (r.steps.length === 0) return done('failed', `“${r.name}” has no steps yet.`);

    const abort = new AbortController();
    this.running = { id, abort };
    r.lastRun = this.now();
    this.changed();
    const sleep = this.d.sleep ?? defaultSleep;
    const failures: string[] = [];
    let ok = 0;
    const total = r.steps.length;
    const progress = (
      index: number,
      status: RoutineProgress['status'],
      message = '',
      say?: string,
    ): void =>
      this.d.onProgress({
        routineId: id,
        name: r.name,
        index,
        total,
        status,
        message,
        ...(say ? { say } : {}),
      });

    try {
      for (const [i, step] of r.steps.entries()) {
        if (abort.signal.aborted) break;
        const label = describeStep(step);
        const problem = stepProblem(step);
        if (problem) {
          failures.push(`${label}: ${problem}`);
          progress(i, 'failed', problem);
          continue;
        }
        progress(i, 'running', label);
        if (step.kind === 'say') {
          ok++;
          progress(i, 'success', label, step.target);
        } else if (step.kind === 'briefing') {
          ok++;
          progress(i, 'success', label, this.d.briefing());
        } else if (step.kind === 'wait') {
          await sleep(Math.min(MAX_WAIT_S, Number(step.target)) * 1000, abort.signal);
          ok++;
          progress(i, 'success', label);
        } else {
          const intent = stepIntent(step);
          let res: CommandResult;
          try {
            if (!intent) throw new Error('Unknown step.');
            res = await this.d.execute(toCommand(intent, `${commandId}-${i}`));
          } catch (err) {
            res = done('failed', err instanceof Error ? err.message : 'Step failed.');
          }
          if (res.status === 'success') ok++;
          else failures.push(`${label}: ${res.message}`);
          progress(i, res.status, res.message);
        }
      }
    } finally {
      this.running = null;
    }

    if (abort.signal.aborted)
      return done('failed', `Stopped “${r.name}” after ${ok} of ${total} steps.`);
    if (failures.length === 0)
      return done(
        'success',
        `Ran “${r.name}”: ${total === 1 ? 'done' : `all ${total} steps done`}.`,
      );
    return done(
      ok > 0 ? 'success' : 'failed',
      `Ran “${r.name}”: ${ok} of ${total} steps done. ${failures.join(' ')}`,
    );
  }

  private changed(): void {
    this.save();
    this.d.onChange(this.list());
  }

  private save(): void {
    if (!this.d.file) return;
    try {
      mkdirSync(dirname(this.d.file), { recursive: true });
      const tmp = `${this.d.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.routines, null, 2));
      renameSync(tmp, this.d.file);
    } catch {
      // Not fatal: routines still work for this session.
    }
  }
}
