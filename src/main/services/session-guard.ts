/** Keeps userData/session.json up to date while Alton runs: a heartbeat every 30 s, the work in
 *  progress (Agent Mode task, background research) and whether it quit properly. The next start
 *  reads it to tell a clean quit from a power cut or a crash (see shared/session.ts). */
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { uptime } from 'node:os';
import { join } from 'node:path';
import { app } from 'electron';
import { lastSessionReport, type RecoveryReport, type SessionRecord } from '@shared/session';

export class SessionGuard {
  private readonly file: string;
  private rec: SessionRecord;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** What the last session left behind (read once, at start-up). */
  readonly report: RecoveryReport | null;

  constructor(userData: string, version: string) {
    this.file = join(userData, 'session.json');
    let prev: SessionRecord | null;
    try {
      prev = JSON.parse(readFileSync(this.file, 'utf8')) as SessionRecord;
      if (typeof prev.lastAlive !== 'number' || typeof prev.work !== 'object') prev = null;
    } catch {
      prev = null;
    }
    this.report = lastSessionReport(prev, Date.now() - uptime() * 1000);
    const now = Date.now();
    this.rec = { clean: false, startedAt: now, lastAlive: now, version, work: {} };
    this.save();
  }

  /** Heartbeat every 30 s. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.rec.lastAlive = Date.now();
      this.save();
    }, 30_000);
    this.timer.unref?.();
  }

  setAgent(a: { task: string; step: number } | null): void {
    const cur = this.rec.work.agent;
    if (!a && !cur) return;
    if (a && cur && cur.task === a.task && cur.step === a.step) return;
    this.rec.work.agent = a ? { ...a, task: a.task.slice(0, 200), at: Date.now() } : null;
    this.save();
  }

  researchStarted(topic: string): void {
    this.rec.work.research = [...(this.rec.work.research ?? []), topic.slice(0, 200)].slice(-10);
    this.save();
  }

  researchEnded(topic: string): void {
    const t = topic.slice(0, 200);
    const list = this.rec.work.research ?? [];
    const i = list.indexOf(t);
    if (i < 0) return;
    this.rec.work.research = [...list.slice(0, i), ...list.slice(i + 1)];
    this.save();
  }

  /** Quitting properly (or Windows shutting down normally). */
  markClean(): void {
    this.rec.clean = true;
    this.rec.lastAlive = Date.now();
    this.save();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private save(): void {
    try {
      writeFileSync(`${this.file}.tmp`, JSON.stringify(this.rec));
      renameSync(`${this.file}.tmp`, this.file);
    } catch {
      /* not fatal */
    }
  }
}

let one: SessionGuard | null = null;
/** The one SessionGuard for this run. */
export const sessionGuard = (): SessionGuard =>
  (one ??= new SessionGuard(app.getPath('userData'), app.getVersion()));
