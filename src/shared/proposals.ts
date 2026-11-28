/** Improvement proposals (Phase 3, item 3): Alton suggests changes to itself from what it finds:
 *  problems in its own log (shared/self-diagnosis.ts), and the shape of its code
 *  (shared/code-map.ts): big untested parts, unfinished TODOs, very large files. Only
 *  suggestions: nothing is changed. The person accepts or dismisses each one; a dismissed idea
 *  isn't suggested again. Pure; tested in tests/proposals.test.ts. */
import type { Diagnosis, ErrorGroup } from './self-diagnosis';

export type ProposalKind = 'fix' | 'test' | 'cleanup';
export type ProposalStatus = 'new' | 'accepted' | 'dismissed' | 'done';

export interface Proposal {
  /** Stable for the same idea, so it's never suggested twice. */
  id: string;
  kind: ProposalKind;
  title: string;
  why: string;
  /** Files it would touch (when known). */
  files: string[];
  effort: 'small' | 'medium' | 'large';
  /** 1 (most worth doing) – 3. */
  priority: 1 | 2 | 3;
  status: ProposalStatus;
  at: number;
}

/** A short stable id from text (FNV-1a). */
export function ideaId(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const day = (t: number): string => new Date(t).toISOString().slice(0, 10);

function fromProblem(g: ErrorGroup, now: number): Proposal | null {
  // One-off network blips and the like aren't worth a change.
  if (g.severity === 'low' && g.count < 20) return null;
  const what = g.sample.length > 110 ? `${g.sample.slice(0, 110)}…` : g.sample;
  return {
    id: ideaId(`fix|${g.where}|${g.signature}`),
    kind: 'fix',
    title: `Fix: ${what}`,
    why: `Seen ${g.count} time${g.count === 1 ? '' : 's'} (${day(g.first)} to ${day(g.last)}) in the ${g.where} part.${g.cause ? ` ${g.cause}` : ''}${g.frame ? ` First seen at ${g.frame}.` : ''}`,
    files: [],
    effort: g.severity === 'high' ? 'medium' : 'small',
    priority: g.severity === 'high' ? 1 : g.severity === 'medium' ? 2 : 3,
    status: 'new',
    at: now,
  };
}

export interface CodeFacts {
  untested: Array<{ path: string; lines: number }>;
  todos: Array<{ path: string; line: number; text: string }>;
  biggest: Array<{ path: string; lines: number }>;
}

/** New ideas from a diagnosis and the code (ones already known, in any status, are left out). */
export function propose(o: {
  diagnosis?: Diagnosis | null;
  code?: CodeFacts | null;
  known: Proposal[];
  now: number;
}): Proposal[] {
  const out: Proposal[] = [];
  for (const g of o.diagnosis?.problems ?? []) {
    const p = fromProblem(g, o.now);
    if (p) out.push(p);
  }
  for (const u of (o.code?.untested ?? []).filter((x) => x.lines >= 300).slice(0, 3))
    out.push({
      id: ideaId(`test|${u.path}`),
      kind: 'test',
      title: `Add tests for ${u.path}`,
      why: `${u.lines} lines with no tests checking them, so a change there could break something without anyone noticing.`,
      files: [u.path],
      effort: u.lines > 1000 ? 'large' : 'medium',
      priority: 2,
      status: 'new',
      at: o.now,
    });
  for (const t of (o.code?.todos ?? []).slice(0, 3))
    out.push({
      id: ideaId(`todo|${t.path}|${t.text}`),
      kind: 'cleanup',
      title: `Finish: ${t.text.replace(/^\/\/\s*|^\/\*+\s*|\*\/$/g, '').slice(0, 100)}`,
      why: `Left unfinished in ${t.path}:${t.line}.`,
      files: [t.path],
      effort: 'small',
      priority: 3,
      status: 'new',
      at: o.now,
    });
  for (const b of (o.code?.biggest ?? []).filter((x) => x.lines >= 2000).slice(0, 2))
    out.push({
      id: ideaId(`split|${b.path}`),
      kind: 'cleanup',
      title: `Split ${b.path} into smaller parts`,
      why: `${b.lines} lines in one file: harder to change safely and to test.`,
      files: [b.path],
      effort: 'large',
      priority: 3,
      status: 'new',
      at: o.now,
    });
  const known = new Set(o.known.map((k) => k.id));
  const seen = new Set<string>();
  return out.filter((p) => !known.has(p.id) && !seen.has(p.id) && !!seen.add(p.id));
}

/** Newest-first list for the person: open ones first, by priority. */
export function sortProposals(list: Proposal[]): Proposal[] {
  const open = (p: Proposal): number => (p.status === 'new' ? 0 : p.status === 'accepted' ? 1 : 2);
  return [...list].sort((a, b) => open(a) - open(b) || a.priority - b.priority || b.at - a.at);
}
