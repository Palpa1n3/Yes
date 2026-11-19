/** Self-debugging: an error/warning log (main + renderer) and read-only access to ARC's own
 *  source folder, so Claude can explain problems and draft fixes. Nothing here writes code. */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import type { ActionRecord } from '@shared/audit';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';

const MAX_LINES = 500;
const MAX_FILE_BYTES = 1024 * 1024;

export class ErrorLog {
  private lines: string[] = [];

  constructor(
    private readonly file?: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  add(level: 'error' | 'warn' | 'info', where: string, msg: string): void {
    const clean = msg.replace(/\s+\n/g, '\n').trim().slice(0, 2000);
    if (!clean) return;
    // Keys and passwords never go in the log.
    const safe = redact(clean);
    const line = `${this.now().toISOString()} ${level.toUpperCase()} [${where}] ${safe}`;
    this.lines.push(line);
    if (this.lines.length > MAX_LINES) this.lines.splice(0, this.lines.length - MAX_LINES);
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      if (existsSync(this.file) && statSync(this.file).size > MAX_FILE_BYTES)
        renameSync(this.file, `${this.file}.old`);
      appendFileSync(this.file, `${line}\n`);
    } catch {
      /* logging must never break anything */
    }
  }

  /** Errors logged in the last `ms` (for "I keep hitting errors" suggestions). */
  recentErrors(ms = 3600_000): number {
    const since = this.now().getTime() - ms;
    return this.lines.filter((l) => / ERROR \[/.test(l) && Date.parse(l.slice(0, 24)) >= since)
      .length;
  }

  tail(n = 80): string[] {
    return this.lines.slice(-Math.max(1, Math.min(MAX_LINES, n)));
  }

  /** Catch console.warn/error and crashes in this (main) process. */
  capture(proc: NodeJS.Process = process, c: Console = console): void {
    const fmt = (args: unknown[]): string =>
      args
        .map((a) =>
          a instanceof Error ? (a.stack ?? a.message) : typeof a === 'string' ? a : safeJson(a),
        )
        .join(' ');
    const warn = c.warn.bind(c);
    const error = c.error.bind(c);
    c.warn = (...a: unknown[]) => {
      this.add('warn', 'main', fmt(a));
      warn(...a);
    };
    c.error = (...a: unknown[]) => {
      this.add('error', 'main', fmt(a));
      error(...a);
    };
    proc.on('uncaughtException', (e) =>
      this.add('error', 'main', `Uncaught: ${e.stack ?? e.message}`),
    );
    proc.on('unhandledRejection', (r) =>
      this.add(
        'error',
        'main',
        `Unhandled promise: ${r instanceof Error ? (r.stack ?? r.message) : String(r)}`,
      ),
    );
  }
}

/** Mask anything key- or password-shaped. */
export function redact(text: string): string {
  return text
    .replace(
      /\b(sk-[\w-]{10,}|ghp_\w{10,}|gho_\w{10,}|xox[bp]-[\w-]{10,}|AKIA\w{12,}|eyJ[\w.-]{20,})/g,
      '[hidden]',
    )
    .replace(
      /((?:password|passwd|pass|pwd|token|secret|api[_-]?key)\s*[=:]\s*)\S+/gi,
      '$1[hidden]',
    );
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'release',
  'coverage',
  '.vite',
  'build',
]);
const TEXT_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.css',
  '.html',
  '.yml',
  '.yaml',
  '.txt',
]);
const BLOCKED = /(^|[\\/])(\.env[^\\/]*|.*\.(bin|key|pem|pfx|p12)|.*secret.*|.*credential.*)$/i;

/** Read-only view of a project folder: list, search and read text files under it. */
export class SourceReader {
  constructor(private readonly root: () => string) {}

  private base(): string {
    const r = this.root().trim();
    if (!r)
      throw new Error(
        'No source code found. The user can choose the project folder in Settings › Advanced › Source folder.',
      );
    // The project folder has package.json; the copy shipped with the app has just src/.
    if (!existsSync(join(r, 'package.json')) && !existsSync(join(r, 'src')))
      throw new Error(
        'The source folder is missing or has no package.json. Check Settings › Advanced › Source folder.',
      );
    return resolve(r);
  }

  /** Resolve a relative path safely inside the root (never outside it, never secrets). */
  private safe(rel: string): string {
    const base = this.base();
    const p = resolve(base, rel.replace(/^[\\/]+/, ''));
    const r = relative(base, p);
    if (!r || r.startsWith('..') || resolve(r) === r)
      throw new Error('That path is outside the project.');
    if (r.split(sep).some((part) => SKIP_DIRS.has(part)) || BLOCKED.test(r))
      throw new Error('That file is not readable.');
    return p;
  }

  files(limit = 400): string[] {
    const base = this.base();
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (out.length >= limit) return;
        if (e.name.startsWith('.') && e.name !== '.github') continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) {
          if (!SKIP_DIRS.has(e.name)) walk(p);
        } else if (
          TEXT_EXT.has(extname(e.name)) &&
          !BLOCKED.test(e.name) &&
          e.name !== 'package-lock.json'
        ) {
          out.push(relative(base, p).split(sep).join('/'));
        }
      }
    };
    walk(base);
    return out.sort();
  }

  read(rel: string, from = 1, to?: number): { path: string; lines: string; total: number } {
    const p = this.safe(rel);
    if (!existsSync(p) || !statSync(p).isFile()) throw new Error(`No file ${rel}.`);
    if (statSync(p).size > 400 * 1024) throw new Error('That file is too big to read.');
    const all = readFileSync(p, 'utf8').split('\n');
    const start = Math.max(1, from);
    const end = Math.min(all.length, to ?? start + 399);
    return {
      path: rel,
      total: all.length,
      lines: all
        .slice(start - 1, end)
        .map((l, i) => `${start + i}\t${l}`)
        .join('\n'),
    };
  }

  search(query: string, limit = 60): Array<{ path: string; line: number; text: string }> {
    const q = query.toLowerCase();
    if (q.length < 2) return [];
    const hits: Array<{ path: string; line: number; text: string }> = [];
    for (const f of this.files(2000)) {
      if (hits.length >= limit) break;
      let text: string;
      try {
        text = readFileSync(join(this.base(), f), 'utf8');
      } catch {
        continue;
      }
      text.split('\n').forEach((l, i) => {
        if (hits.length < limit && l.toLowerCase().includes(q))
          hits.push({ path: f, line: i + 1, text: l.trim().slice(0, 200) });
      });
    }
    return hits;
  }

  /** The read_arc_source tool. */
  tool(input: unknown): unknown {
    const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    const path = typeof o.path === 'string' ? o.path.trim() : '';
    const query = typeof o.query === 'string' ? o.query.trim().slice(0, 200) : '';
    if (path) return this.read(path, Number(o.from) || 1, Number(o.to) || undefined);
    if (query) return { matches: this.search(query) };
    return { files: this.files() };
  }
}

/** Everything Alton has done on the PC (and to its own memory), newest last.
 *  Kept on this PC in logs/actions.jsonl; shown in Settings › Privacy. */
export class AuditLog {
  private items: ActionRecord[] = [];

  constructor(
    private readonly file?: string,
    private readonly now: () => number = Date.now,
  ) {
    if (!file || !existsSync(file)) return;
    try {
      this.items = readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .slice(-MAX_LINES)
        .flatMap((l) => {
          try {
            const r = JSON.parse(l) as ActionRecord;
            return typeof r.text === 'string' && typeof r.at === 'number' ? [r] : [];
          } catch {
            return [];
          }
        });
    } catch {
      /* start fresh */
    }
  }

  add(source: ActionRecord['source'], text: string, ok = true): void {
    const r: ActionRecord = { at: this.now(), source, text: redact(text).slice(0, 300), ok };
    this.items.push(r);
    if (this.items.length > MAX_LINES) this.items.splice(0, this.items.length - MAX_LINES);
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      if (existsSync(this.file) && statSync(this.file).size > MAX_FILE_BYTES)
        renameSync(this.file, `${this.file}.old`);
      appendFileSync(this.file, `${JSON.stringify(r)}\n`);
    } catch {
      /* not fatal */
    }
  }

  list(): ActionRecord[] {
    return [...this.items].reverse();
  }

  clear(): void {
    this.items = [];
    if (!this.file) return;
    try {
      writeFileSync(this.file, '');
    } catch {
      /* not fatal */
    }
  }
}
