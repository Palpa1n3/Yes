/** Full process list for the Task Manager tab, grouped by app. CPU% comes from two
 *  samples, so the very first call only takes a baseline. */
import os from 'node:os';
import { groupTasks, type ProcSample, type TaskList } from '@shared/tasks';

export interface TaskManagerDeps {
  sample(): Promise<ProcSample[]>;
  isProtected(name: string): boolean;
  now?: () => number;
  threads?: number;
}

export class TaskManager {
  private prev: { at: number; list: ProcSample[] } | null = null;
  private inflight: Promise<TaskList> | null = null;
  private readonly now: () => number;

  constructor(private readonly d: TaskManagerDeps) {
    this.now = d.now ?? Date.now;
  }

  list(): Promise<TaskList> {
    this.inflight ??= (async () => {
      try {
        const list = await this.d.sample();
        const at = this.now();
        const prev = this.prev;
        this.prev = { at, list };
        const direct = list.some((p) => p.cpuPct !== undefined);
        if (!direct && (!prev || at - prev.at > 60_000)) return { tasks: null, at };
        return {
          tasks: groupTasks(
            prev?.list ?? [],
            list,
            prev ? (at - prev.at) / 1000 : 0,
            this.d.threads ?? os.cpus().length,
            this.d.isProtected,
          ),
          at,
        };
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }
}
