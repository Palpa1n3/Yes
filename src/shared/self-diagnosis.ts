/** Self-diagnosis (Phase 3, item 1): Alton reads its own error log and works out what's actually
 *  wrong. The same error repeated a hundred times (with different ids, build hashes or numbers)
 *  is one problem; known causes get a plain-words explanation; problems not seen since the last
 *  update are marked as probably fixed. Combined with the start-up health check and recent crash
 *  count into one ranked report. Read-only; nothing is changed. Pure; tested in
 *  tests/self-diagnosis.test.ts. */

export interface LogLine {
  at: number;
  level: 'ERROR' | 'WARN' | 'INFO';
  where: string;
  text: string;
}

/** "2026-11-28T00:09:20.476Z WARN [ui] message" → parts (null for anything else). */
export function parseLogLine(line: string): LogLine | null {
  const m = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z) (ERROR|WARN|INFO) \[([^\]]{1,40})\] (.*)$/s.exec(line);
  if (!m) return null;
  const at = Date.parse(m[1] ?? '');
  if (!Number.isFinite(at)) return null;
  return { at, level: m[2] as LogLine['level'], where: m[3] ?? '', text: m[4] ?? '' };
}

/** The message with what changes between repeats taken out: ids, hashes, numbers, paths, quotes. */
export function signature(text: string): string {
  return (
    (text.split('\n')[0] ?? '')
      .replace(/blob:[^\s'")]+/g, 'blob:…')
      .replace(/https?:\/\/[^\s'")]+/g, 'url…')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '…')
      // Built bundle names: index-Dyy5_eZc.js:26224 or index-BbZd-yRi.js → index.js
      .replace(/\b([A-Za-z][A-Za-z0-9_.]*?)-[\w-]{6,12}\.js(:\d+)*/g, '$1.js')
      .replace(/[A-Za-z]:\\[^\s'")]+|\/(?:[\w.-]+\/)+[\w.-]+/g, 'path…')
      .replace(/\b0x[0-9a-f]+\b/gi, '#')
      .replace(/\b\d+(\.\d+)?\b/g, '#')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200)
  );
}

/** Plain-words causes for errors Alton knows. */
const CAUSES: Array<[RegExp, string, ErrorGroup['severity']?]> = [
  [
    /Content Security Policy/i,
    "Alton's window blocked something it tried to load (its security policy). Usually a bug in Alton: the policy needs to allow it, or the code shouldn't load it that way.",
  ],
  [
    /\b(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|fetch failed|net::ERR_)/i,
    'A network problem: the internet, a website or a service was unreachable at the time. Usually not a bug.',
    'low',
  ],
  [
    /\b(401|authentication_error|invalid x-api-key)\b/i,
    'The Claude key was rejected: check it in Settings › AI.',
    'high',
  ],
  [
    /\b(429|rate_limit|529|overloaded)/i,
    "Claude was busy or Alton hit a rate limit. It passes; if it's constant, fewer background features help.",
    'low',
  ],
  [
    /\b(EPERM|EBUSY|EACCES)\b/i,
    'A file was locked or not allowed (often another program had it open, or antivirus).',
  ],
  [/\bENOSPC\b|no space left/i, 'The drive is full.', 'high'],
  [/out of memory|heap limit|Allocation failed/i, 'Alton ran out of memory.', 'high'],
  [
    /deprecated/i,
    'A part of Alton uses something that Chromium/Electron will remove in future. Harmless for now; worth updating.',
    'low',
  ],
  [
    /Uncaught|unhandledRejection|Unhandled/i,
    'An unexpected crash inside Alton: a bug to fix.',
    'high',
  ],
];

export interface ErrorGroup {
  signature: string;
  where: string;
  level: LogLine['level'];
  count: number;
  first: number;
  last: number;
  /** One real example (first line). */
  sample: string;
  /** The first stack frame, if there was one. */
  frame?: string;
  cause?: string;
  severity: 'high' | 'medium' | 'low';
  /** Not seen since the last update: probably fixed. */
  fixedSinceUpdate?: boolean;
}

/** Group errors and warnings (info lines are ignored). */
export function groupErrors(lines: LogLine[], updatedAt?: number): ErrorGroup[] {
  const map = new Map<string, ErrorGroup>();
  for (const l of lines) {
    if (l.level === 'INFO') continue;
    const sig = signature(l.text);
    const key = `${l.level}|${l.where}|${sig}`;
    const g = map.get(key);
    if (g) {
      g.count++;
      g.first = Math.min(g.first, l.at);
      g.last = Math.max(g.last, l.at);
      continue;
    }
    const frame = /\bat (?:[\w$.<>]+ )?\(?([^()\s]+:\d+:\d+)\)?/.exec(l.text)?.[1];
    const known = CAUSES.find(([re]) => re.test(l.text));
    map.set(key, {
      signature: sig,
      where: l.where,
      level: l.level,
      count: 1,
      first: l.at,
      last: l.at,
      sample: (l.text.split('\n')[0] ?? '').slice(0, 300),
      ...(frame ? { frame } : {}),
      ...(known ? { cause: known[1] } : {}),
      severity: known?.[2] ?? (l.level === 'ERROR' ? 'medium' : 'low'),
    });
  }
  const out = [...map.values()];
  if (updatedAt) for (const g of out) if (g.last < updatedAt) g.fixedSinceUpdate = true;
  const rank = { high: 3, medium: 2, low: 1 } as const;
  return out.sort(
    (a, b) =>
      Number(!!a.fixedSinceUpdate) - Number(!!b.fixedSinceUpdate) ||
      rank[b.severity] - rank[a.severity] ||
      b.count - a.count ||
      b.last - a.last,
  );
}

export interface Diagnosis {
  version: string;
  /** One line for the person. */
  summary: string;
  /** Still happening, most important first. */
  problems: ErrorGroup[];
  /** Not seen since the last update. */
  probablyFixed: ErrorGroup[];
  health: { ok: boolean; failed: string[] } | null;
  crashes: number;
}

export function diagnose(o: {
  version: string;
  lines: LogLine[];
  updatedAt?: number;
  health?: { ok: boolean; failed: string[] } | null;
  crashes?: number;
}): Diagnosis {
  const groups = groupErrors(o.lines, o.updatedAt);
  const problems = groups.filter((g) => !g.fixedSinceUpdate);
  const probablyFixed = groups.filter((g) => g.fixedSinceUpdate);
  const high = problems.filter((g) => g.severity === 'high').length;
  const crashes = o.crashes ?? 0;
  const parts: string[] = [];
  if (o.health && !o.health.ok)
    parts.push(`the start-up check failed (${o.health.failed.join(', ')})`);
  if (crashes) parts.push(`${crashes} crash${crashes === 1 ? '' : 'es'} recently`);
  if (high) parts.push(`${high} serious problem${high === 1 ? '' : 's'} in the log`);
  const minor = problems.length - high;
  const summary = parts.length
    ? `Alton ${o.version}: ${parts.join(', ')}${minor ? `, plus ${minor} minor` : ''}.`
    : problems.length
      ? `Alton ${o.version} is working; ${problems.length} minor thing${problems.length === 1 ? '' : 's'} in the log.`
      : `Alton ${o.version} is working, with nothing wrong in the log.`;
  return {
    version: o.version,
    summary,
    problems: problems.slice(0, 12),
    probablyFixed: probablyFixed.slice(0, 6),
    health: o.health ?? null,
    crashes,
  };
}
