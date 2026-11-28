/** Alton's improvement ideas for itself (userData/proposals.json): made weekly from its own
 *  diagnosis and code map, then accepted, dismissed or marked done by the person. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  propose,
  sortProposals,
  type CodeFacts,
  type Proposal,
  type ProposalStatus,
} from '@shared/proposals';
import type { Diagnosis } from '@shared/self-diagnosis';

const WEEK = 7 * 86_400_000;

export class ProposalStore {
  private list: Proposal[] = [];
  private lastRun = 0;

  constructor(
    private readonly file?: string,
    private readonly now: () => number = Date.now,
  ) {
    try {
      if (file && existsSync(file)) {
        const j = JSON.parse(readFileSync(file, 'utf8')) as { list?: Proposal[]; lastRun?: number };
        this.list = Array.isArray(j.list) ? j.list : [];
        this.lastRun = Number(j.lastRun) || 0;
      }
    } catch {
      /* fresh */
    }
  }

  private save(): void {
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(`${this.file}.tmp`, JSON.stringify({ list: this.list, lastRun: this.lastRun }));
      renameSync(`${this.file}.tmp`, this.file);
    } catch {
      /* not fatal */
    }
  }

  all(): Proposal[] {
    return sortProposals(this.list);
  }

  /** Add new ideas; returns them. */
  refresh(diagnosis: Diagnosis | null, code: CodeFacts | null): Proposal[] {
    const fresh = propose({ diagnosis, code, known: this.list, now: this.now() });
    this.list = [...this.list, ...fresh].slice(-100);
    this.lastRun = this.now();
    this.save();
    return fresh;
  }

  /** Time for the weekly look? */
  due(): boolean {
    return this.now() - this.lastRun >= WEEK;
  }

  set(id: string, status: ProposalStatus): Proposal | null {
    const p = this.list.find((x) => x.id === id);
    if (!p) return null;
    p.status = status;
    this.save();
    return p;
  }

  /** The improvement_ideas tool. */
  tool(
    input: unknown,
    make: () => { diagnosis: Diagnosis | null; code: CodeFacts | null },
  ): unknown {
    const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    const action = typeof o.action === 'string' ? o.action : 'list';
    const id = typeof o.id === 'string' ? o.id : '';
    if (action === 'refresh') {
      const m = make();
      const fresh = this.refresh(m.diagnosis, m.code);
      return {
        new: fresh.length,
        ideas: this.all()
          .filter((p) => p.status === 'new')
          .slice(0, 15),
      };
    }
    if (action === 'accept' || action === 'dismiss' || action === 'done') {
      const p = this.set(
        id,
        action === 'accept' ? 'accepted' : action === 'dismiss' ? 'dismissed' : 'done',
      );
      return p ? { ok: true, idea: p } : { error: `No idea with id ${id}.` };
    }
    const list = this.all();
    return {
      open: list.filter((p) => p.status === 'new' || p.status === 'accepted').slice(0, 20),
      dismissed: list.filter((p) => p.status === 'dismissed').length,
      done: list.filter((p) => p.status === 'done').length,
    };
  }
}
