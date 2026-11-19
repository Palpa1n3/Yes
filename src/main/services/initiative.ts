/** Decides when Alton speaks up: runs the suggestion rules every couple of minutes and
 *  offers at most one suggestion at a time, with cooldowns, quiet hours and no interruptions
 *  while gaming, in Agent Mode or when the user is away. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  COOLDOWN_MS,
  MIN_GAP_MS,
  RULES,
  inQuietHours,
  type InitiativeInput,
  type Suggestion,
  type SuggestionKind,
} from '@shared/initiative';

export interface InitiativeDeps {
  input(): InitiativeInput | Promise<InitiativeInput>;
  enabled(): boolean;
  quietHours(): { start: number; end: number };
  /** Gaming, Agent Mode running, etc. */
  busy(): boolean;
  /** Seconds since the last keyboard/mouse input. */
  idleSec(): number;
  emit(s: Suggestion): void;
  file?: string;
  now?: () => number;
}

interface Memory {
  shown: string[];
  lastByKind: Partial<Record<SuggestionKind, number>>;
  last: number;
}

export class Initiative {
  private m: Memory = { shown: [], lastByKind: {}, last: 0 };
  private timer: ReturnType<typeof setInterval> | undefined;
  private first: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly d: InitiativeDeps) {
    try {
      if (d.file && existsSync(d.file)) {
        const raw = JSON.parse(readFileSync(d.file, 'utf8')) as Partial<Memory>;
        this.m = {
          shown: Array.isArray(raw.shown) ? raw.shown.filter((x) => typeof x === 'string') : [],
          lastByKind: raw.lastByKind && typeof raw.lastByKind === 'object' ? raw.lastByKind : {},
          last: Number(raw.last) || 0,
        };
      }
    } catch {
      /* start fresh */
    }
  }

  start(everyMs = 2 * 60_000): void {
    this.stop();
    this.first = setTimeout(() => void this.tick(), 3 * 60_000);
    this.timer = setInterval(() => void this.tick(), everyMs);
  }

  stop(): void {
    clearTimeout(this.first);
    clearInterval(this.timer);
  }

  /** One check; returns the suggestion made, if any (exposed for tests). */
  async tick(): Promise<Suggestion | null> {
    const now = this.d.now?.() ?? Date.now();
    if (!this.d.enabled() || this.d.busy()) return null;
    const { start, end } = this.d.quietHours();
    if (inQuietHours(new Date(now).getHours(), start, end)) return null;
    if (this.d.idleSec() > 10 * 60) return null; // away from the PC
    if (now - this.m.last < MIN_GAP_MS) return null;
    let input: InitiativeInput;
    try {
      input = await this.d.input();
    } catch {
      return null;
    }
    for (const rule of RULES) {
      const s = rule(input);
      if (!s || this.m.shown.includes(s.id)) continue;
      const lastKind = this.m.lastByKind[s.kind] ?? 0;
      if (now - lastKind < COOLDOWN_MS[s.kind]) continue;
      this.m.shown = [...this.m.shown, s.id].slice(-300);
      this.m.lastByKind[s.kind] = now;
      this.m.last = now;
      this.save();
      this.d.emit(s);
      return s;
    }
    return null;
  }

  private save(): void {
    if (!this.d.file) return;
    try {
      mkdirSync(dirname(this.d.file), { recursive: true });
      writeFileSync(`${this.d.file}.tmp`, JSON.stringify(this.m));
      renameSync(`${this.d.file}.tmp`, this.d.file);
    } catch {
      /* not fatal */
    }
  }
}
