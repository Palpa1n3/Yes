/** Work shifts synced from the phone app (userData/shifts.json), so the PC's Claude knows
 *  the user's rota ("am I working tomorrow?", the morning briefing). */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  cleanShifts,
  describeShift,
  mergeShifts,
  upcomingShifts,
  type Shift,
} from '@shared/shifts';

export class ShiftStore {
  private shifts: Shift[] = [];

  constructor(private readonly file?: string) {
    try {
      if (file && existsSync(file))
        this.shifts = cleanShifts(JSON.parse(readFileSync(file, 'utf8')));
    } catch {
      this.shifts = [];
    }
  }

  /** Add or update shifts; returns how many came in. */
  merge(raw: unknown, now = new Date()): number {
    const incoming = cleanShifts(raw);
    if (!incoming.length) return 0;
    this.shifts = mergeShifts(this.shifts, incoming, now);
    this.save();
    return incoming.length;
  }

  upcoming(now = new Date()): Shift[] {
    return upcomingShifts(this.shifts, now);
  }

  /** One line for Claude: the next two weeks of shifts ('' when there are none). */
  summary(now = new Date()): string {
    const until = now.getTime() + 14 * 86_400_000;
    const soon = this.upcoming(now).filter((s) => new Date(s.start).getTime() < until);
    return soon.length
      ? `The user's upcoming work shifts (from their rota): ${soon.map((s) => `${describeShift(s)} ${s.title}`).join('; ')}.`
      : '';
  }

  private save(): void {
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(`${this.file}.tmp`, JSON.stringify(this.shifts));
      renameSync(`${this.file}.tmp`, this.file);
    } catch {
      /* non-fatal */
    }
  }
}
