/** Development roadmap management (Phase 3, item 7): Alton reads its own plan (ROADMAP.md in the
 *  project: phases with ✅ done / 🔶 part-done / ⬜ to-do items), knows where it's up to and what
 *  comes next, and lines the person's wishes (the Notes "Alton roadmap" list) up against it so
 *  the ones not planned yet stand out. Changing ROADMAP.md goes through the development copy and
 *  the person's approval like any other change. Pure; tested in tests/dev-roadmap.test.ts. */
import { similarity } from './memory-tidy';

export type ItemState = 'done' | 'partial' | 'todo';

export interface RoadmapItem {
  /** The item's first sentence (without its status mark or later notes). */
  text: string;
  state: ItemState;
}

export interface RoadmapPhase {
  title: string;
  /** What's in brackets after the title, e.g. "done, 0.81–0.90". */
  note: string;
  items: RoadmapItem[];
}

const MARK: Record<string, ItemState> = { '✅': 'done', '🔶': 'partial', '⬜': 'todo' };

export function parseRoadmap(md: string): RoadmapPhase[] {
  const phases: RoadmapPhase[] = [];
  let cur: RoadmapPhase | null = null;
  for (const line of md.split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*(?:\(([^)]*)\))?\s*$/.exec(line);
    if (h) {
      cur = { title: (h[1] ?? '').trim(), note: (h[2] ?? '').trim(), items: [] };
      phases.push(cur);
      continue;
    }
    const it = /^-\s+(✅|🔶|⬜)\s+(.+)$/u.exec(line);
    if (it && cur) {
      // Just the item itself: up to its first full stop, or before any version notes.
      const raw = (it[2] ?? '').split(/\s\*\*\d/)[0] ?? '';
      const text = (/^(.+?\.)(\s|$)/.exec(raw)?.[1] ?? raw).trim();
      cur.items.push({ text, state: MARK[it[1] ?? ''] ?? 'todo' });
    }
  }
  return phases.filter((p) => p.items.length);
}

export interface RoadmapStatus {
  phases: Array<{ title: string; note: string; done: number; partial: number; total: number }>;
  /** The phase being worked on: the first with anything not done. */
  current: string | null;
  /** The next items to do, in order. */
  next: Array<{ phase: string; text: string; state: ItemState }>;
  done: number;
  total: number;
}

export function roadmapStatus(phases: RoadmapPhase[]): RoadmapStatus {
  const open = phases.flatMap((p) =>
    p.items.filter((i) => i.state !== 'done').map((i) => ({ phase: p.title, ...i })),
  );
  const all = phases.flatMap((p) => p.items);
  return {
    phases: phases.map((p) => ({
      title: p.title,
      note: p.note,
      done: p.items.filter((i) => i.state === 'done').length,
      partial: p.items.filter((i) => i.state === 'partial').length,
      total: p.items.length,
    })),
    current: open[0]?.phase ?? null,
    next: open.slice(0, 5),
    done: all.filter((i) => i.state === 'done').length,
    total: all.length,
  };
}

/** The person's wishes (not ticked off) against the plan: which it already covers, which not. */
export function wishesVsPlan(
  wishes: Array<{ text: string; done: boolean }>,
  phases: RoadmapPhase[],
): { planned: Array<{ wish: string; item: string }>; notPlanned: string[] } {
  const items = phases.flatMap((p) => p.items.map((i) => i.text));
  const planned: Array<{ wish: string; item: string }> = [];
  const notPlanned: string[] = [];
  for (const w of wishes.filter((x) => !x.done)) {
    let best = '';
    let score = 0;
    for (const i of items) {
      const s = similarity(w.text, i);
      if (s > score) {
        score = s;
        best = i;
      }
    }
    if (score >= 0.25) planned.push({ wish: w.text, item: best });
    else notPlanned.push(w.text);
  }
  return { planned, notPlanned };
}
