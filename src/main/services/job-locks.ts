/** Stops Alton's automated jobs clashing: each job takes the things it uses (Vortex, the mouse
 *  and keyboard, the game's mod files…) and another job wanting one of them waits or says what
 *  it's waiting for. No Electron here: tested in tests/main/job-locks.test.ts. */

export type Resource =
  /** Vortex itself (its window, its state, installs through it). */
  | 'vortex'
  /** The mouse and keyboard (Agent Mode, pressing buttons in other apps). */
  | 'input'
  /** Cyberpunk's mod files (saving/putting back mods, fixes, load order). */
  | 'cyberpunk-files'
  /** Minecraft's mods folder. */
  | 'minecraft-files';

export const RESOURCE_LABEL: Record<Resource, string> = {
  vortex: 'Vortex',
  input: 'the mouse and keyboard',
  'cyberpunk-files': 'Cyberpunk’s mod files',
  'minecraft-files': 'Minecraft’s mods',
};

interface Hold {
  label: string;
  /** The same job taking it again (one step calling another) adds to this. */
  count: number;
  since: number;
  /** Released automatically after this (a job that crashed can't block forever). */
  until: number;
}

export class JobLocks {
  private held = new Map<Resource, Hold>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  /** Who has this, if anyone (expired holds don't count). */
  holder(r: Resource): string | null {
    const h = this.held.get(r);
    if (!h) return null;
    if (this.now() > h.until) {
      this.held.delete(r);
      return null;
    }
    return h.label;
  }

  /** What's running now, for "is anything busy?" (e.g. before shutting the PC down). */
  busy(): Array<{ resource: Resource; label: string }> {
    const out: Array<{ resource: Resource; label: string }> = [];
    for (const r of [...this.held.keys()]) {
      const label = this.holder(r);
      if (label) out.push({ resource: r, label });
    }
    return out;
  }

  /** Take all of `resources` for `label`, or none: returns a release function, or the reason it
   *  couldn't (the first one in use). `maxMs` caps how long the hold can last. */
  take(
    resources: Resource[],
    label: string,
    maxMs = 30 * 60_000,
  ): { release: () => void } | { waitingFor: string } {
    for (const r of resources) {
      const h = this.holder(r);
      if (h && h !== label) return { waitingFor: `${h} is using ${RESOURCE_LABEL[r]}` };
    }
    const now = this.now();
    for (const r of resources) {
      const h = this.held.get(r);
      if (h && h.label === label && now <= h.until) {
        h.count++;
        h.until = Math.max(h.until, now + maxMs);
      } else this.held.set(r, { label, count: 1, since: now, until: now + maxMs });
    }
    let done = false;
    return {
      release: () => {
        if (done) return;
        done = true;
        for (const r of resources) {
          const h = this.held.get(r);
          if (h?.label !== label) continue;
          if (--h.count <= 0) this.held.delete(r);
        }
      },
    };
  }

  /** Run `job` holding `resources`; if they're in use, don't run it and return why. */
  async run<T>(
    resources: Resource[],
    label: string,
    job: () => Promise<T>,
    maxMs?: number,
  ): Promise<{ ran: true; value: T } | { ran: false; waitingFor: string }> {
    const t = this.take(resources, label, maxMs);
    if ('waitingFor' in t) return { ran: false, waitingFor: t.waitingFor };
    try {
      return { ran: true, value: await job() };
    } finally {
      t.release();
    }
  }
}

/** The one set of locks for this run of Alton. */
export const jobLocks = new JobLocks();
