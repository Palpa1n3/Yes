/** Assorted local abilities for Claude: tidy a folder (with undo), search inside documents,
 *  check Minecraft mods, optimisation tips and a quick benchmark. All read-only except the
 *  folder tidy, which only moves files (never deletes) after the user approves. */
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

/* ── Tidy a folder ───────────────────────────────────────────────────────── */

export const SORT_FOLDERS: Record<string, string[]> = {
  Pictures: [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.bmp',
    '.heic',
    '.svg',
    '.tif',
    '.tiff',
    '.ico',
    '.raw',
  ],
  Videos: ['.mp4', '.mkv', '.mov', '.avi', '.wmv', '.webm', '.m4v'],
  Music: ['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.wma'],
  Documents: ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt', '.md', '.pages', '.epub'],
  Spreadsheets: ['.xls', '.xlsx', '.csv', '.ods', '.numbers'],
  Presentations: ['.ppt', '.pptx', '.odp', '.key'],
  Archives: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'],
  Installers: ['.exe', '.msi', '.msix', '.appx', '.dmg', '.iso'],
  Code: [
    '.js',
    '.ts',
    '.py',
    '.java',
    '.c',
    '.cpp',
    '.cs',
    '.html',
    '.css',
    '.json',
    '.xml',
    '.yml',
    '.yaml',
    '.sh',
    '.ps1',
    '.bat',
  ],
  '3D & Design': ['.psd', '.ai', '.blend', '.fbx', '.obj', '.stl', '.fig', '.xd'],
};

export interface Move {
  from: string;
  to: string;
}

const SKIP = /^(desktop\.ini|thumbs\.db|\..*)$/i;
const PARTIAL = new Set(['.crdownload', '.part', '.tmp', '.download', '.partial']);

/** Where each loose file in `dir` would go (top level only; folders are left alone). */
export function planTidy(dir: string, now = Date.now()): Move[] {
  const moves: Move[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.test(name)) continue;
    const ext = extname(name).toLowerCase();
    if (ext === '.lnk' || ext === '.url' || PARTIAL.has(ext)) continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (!st.isFile() || now - st.mtimeMs < 2 * 60_000) continue; // still being written
    const folder =
      Object.entries(SORT_FOLDERS).find(([, exts]) => exts.includes(ext))?.[0] ?? 'Other';
    moves.push({ from: p, to: join(dir, folder, name) });
  }
  return moves;
}

const unique = (p: string): string => {
  if (!existsSync(p)) return p;
  const ext = extname(p);
  const stem = p.slice(0, p.length - ext.length);
  for (let i = 2; ; i++) if (!existsSync(`${stem} (${i})${ext}`)) return `${stem} (${i})${ext}`;
};

/** Move the files; returns what actually moved (for undo). Never overwrites. */
export function applyTidy(moves: Move[]): Move[] {
  const done: Move[] = [];
  for (const m of moves) {
    try {
      if (!existsSync(m.from)) continue;
      mkdirSync(dirname(m.to), { recursive: true });
      const to = unique(m.to);
      renameSync(m.from, to);
      done.push({ from: m.from, to });
    } catch {
      /* skip a file in use */
    }
  }
  return done;
}

/** Put moved files back (only where nothing new has taken their place). */
export function undoTidy(moves: Move[]): number {
  let n = 0;
  for (const m of [...moves].reverse()) {
    try {
      if (existsSync(m.to) && !existsSync(m.from)) {
        renameSync(m.to, m.from);
        n++;
      }
    } catch {
      /* skip */
    }
  }
  // Remove sort folders left empty.
  for (const d of new Set(moves.map((m) => dirname(m.to))))
    try {
      if (existsSync(d) && readdirSync(d).length === 0) rmSync(d, { recursive: true });
    } catch {
      /* skip */
    }
  return n;
}

export function summariseMoves(moves: Move[]): string {
  const by = new Map<string, string[]>();
  for (const m of moves) {
    const f = basename(dirname(m.to));
    by.set(f, [...(by.get(f) ?? []), basename(m.from)]);
  }
  return [...by.entries()]
    .map(
      ([f, names]) =>
        `${f} (${names.length}): ${names.slice(0, 6).join(', ')}${names.length > 6 ? ', …' : ''}`,
    )
    .join('\n');
}

/* ── Search inside documents ─────────────────────────────────────────────── */

const TEXT_EXT = new Set([
  '.txt',
  '.md',
  '.csv',
  '.log',
  '.json',
  '.xml',
  '.html',
  '.htm',
  '.rtf',
  '.ini',
  '.yml',
  '.yaml',
  '.tex',
  '.srt',
]);
const SKIP_DIR = /^(node_modules|\.git|appdata|\$recycle\.bin|windows|program files.*|\..*)$/i;

/** Text of a .docx (word/document.xml inside the zip), without any zip library. */
export function docxText(file: string): string {
  const buf = readFileSync(file);
  // End of central directory record.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) return '';
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count && p + 46 <= buf.length; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (name === 'word/document.xml') {
      const lNameLen = buf.readUInt16LE(local + 26);
      const lExtra = buf.readUInt16LE(local + 28);
      const start = local + 30 + lNameLen + lExtra;
      const raw = buf.subarray(start, start + size);
      const xml = (method === 8 ? inflateRawSync(raw) : raw).toString('utf8');
      return xml
        .replace(/<\/w:p>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return '';
}

export interface DocHit {
  path: string;
  modified: string;
  snippet: string;
  score: number;
}

/** Files under the roots whose name or text contains the words (best first). */
export function searchDocuments(roots: string[], query: string, limit = 10): DocHit[] {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3);
  if (!words.length) return [];
  const hits: DocHit[] = [];
  let seen = 0;
  const walk = (dir: string, depth: number): void => {
    if (depth > 5 || seen > 8000) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (seen > 8000) return;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIR.test(e.name)) walk(p, depth + 1);
        continue;
      }
      seen++;
      const ext = extname(e.name).toLowerCase();
      const lowName = e.name.toLowerCase();
      const nameScore = words.filter((w) => lowName.includes(w)).length * 2;
      let text = '';
      if (TEXT_EXT.has(ext) || ext === '.docx') {
        try {
          const st = statSync(p);
          if (st.size <= 3 * 1024 * 1024)
            text = ext === '.docx' ? docxText(p) : readFileSync(p, 'utf8');
        } catch {
          /* unreadable */
        }
      }
      const low = text.toLowerCase();
      const textScore = words.filter((w) => low.includes(w)).length;
      const score = nameScore + textScore;
      if (
        !score ||
        (textScore < words.length && nameScore === 0 && words.length > 1 && textScore < 2)
      )
        continue;
      const first = Math.min(...words.map((w) => low.indexOf(w)).filter((i) => i >= 0), Infinity);
      const snippet = Number.isFinite(first)
        ? text
            .slice(Math.max(0, first - 120), first + 220)
            .replace(/\s+/g, ' ')
            .trim()
        : '';
      let modified = '';
      try {
        modified = new Date(statSync(p).mtimeMs).toLocaleDateString();
      } catch {
        /* */
      }
      hits.push({ path: p, modified, snippet, score });
    }
  };
  for (const r of roots) if (existsSync(r)) walk(r, 0);
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/* ── Minecraft mods ──────────────────────────────────────────────────────── */

/** "sodium-fabric-0.5.8+mc1.20.4.jar" → "sodium". */
export function modBase(file: string): string {
  return basename(file, extname(file))
    .toLowerCase()
    .replace(/[-_ +](?:mc)?v?\d+(?:\.\d+)+.*$/, '')
    .replace(/[-_ ](fabric|forge|neoforge|quilt)$/, '')
    .trim();
}

export interface ModReport {
  instance: string;
  mods: number;
  duplicates: Array<{ mod: string; files: string[] }>;
  loaders: string[];
  latestCrash: string | null;
  logErrors: string[];
}

export function checkModsFolder(instanceDir: string, name: string): ModReport | null {
  const modsDir = join(instanceDir, 'mods');
  if (!existsSync(modsDir)) return null;
  const jars = readdirSync(modsDir).filter((f) => /\.jar$/i.test(f));
  const by = new Map<string, string[]>();
  for (const j of jars) by.set(modBase(j), [...(by.get(modBase(j)) ?? []), j]);
  const duplicates = [...by.entries()]
    .filter(([, f]) => f.length > 1)
    .map(([mod, files]) => ({ mod, files }));
  const loaders = ['fabric', 'forge', 'neoforge', 'quilt'].filter((l) =>
    jars.some((j) => new RegExp(`[-_ ]${l}[-_ .]`, 'i').test(j)),
  );
  let latestCrash: string | null = null;
  const crashDir = join(instanceDir, 'crash-reports');
  if (existsSync(crashDir)) {
    const newest = readdirSync(crashDir)
      .filter((f) => f.endsWith('.txt'))
      .map((f) => ({ f, t: statSync(join(crashDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)[0];
    if (newest)
      latestCrash = `${newest.f} (${new Date(newest.t).toLocaleString()}):\n${readFileSync(join(crashDir, newest.f), 'utf8').split('\n').slice(0, 70).join('\n')}`;
  }
  let logErrors: string[] = [];
  const log = join(instanceDir, 'logs', 'latest.log');
  if (existsSync(log))
    logErrors = readFileSync(log, 'utf8')
      .split('\n')
      .filter((l) =>
        /\b(ERROR|FATAL)\b|Exception|Mixin apply failed|requires .* which is missing/i.test(l),
      )
      .slice(-25)
      .map((l) => l.slice(0, 300));
  return { instance: name, mods: jars.length, duplicates, loaders, latestCrash, logErrors };
}

/** Known launcher locations → instance folders (each containing mods/). */
export function minecraftInstances(
  appData: string,
  home: string,
): Array<{ name: string; dir: string }> {
  const out: Array<{ name: string; dir: string }> = [];
  const vanilla = join(appData, '.minecraft');
  if (existsSync(join(vanilla, 'mods'))) out.push({ name: 'Minecraft (default)', dir: vanilla });
  const lists: Array<[string, string]> = [
    [join(home, 'curseforge', 'minecraft', 'Instances'), 'CurseForge'],
    [join(appData, 'PrismLauncher', 'instances'), 'Prism'],
    [join(appData, 'ModrinthApp', 'profiles'), 'Modrinth'],
    [join(appData, '.technic', 'modpacks'), 'Technic'],
  ];
  for (const [root, label] of lists) {
    if (!existsSync(root)) continue;
    for (const n of readdirSync(root)) {
      const base = join(root, n);
      const dir = existsSync(join(base, 'mods'))
        ? base
        : existsSync(join(base, '.minecraft', 'mods'))
          ? join(base, '.minecraft')
          : existsSync(join(base, 'minecraft', 'mods'))
            ? join(base, 'minecraft')
            : null;
      if (dir) out.push({ name: `${n} (${label})`, dir });
    }
  }
  return out;
}

/* ── Optimisation tips ───────────────────────────────────────────────────── */

export interface OptimiseInput {
  startupApps: string[];
  powerPlan: string | null;
  uptimeHours: number;
  disks: Array<{ mount: string; freePct: number }>;
  memUsedPct: number;
  topMemory: Array<{ name: string; gb: number }>;
}

export function optimisationTips(i: OptimiseInput): string[] {
  const tips: string[] = [];
  if (i.startupApps.length > 6)
    tips.push(
      `${i.startupApps.length} apps start with Windows (${i.startupApps.slice(0, 6).join(', ')}…). Turning off the ones you don't need (Task Manager › Startup apps) speeds up boot and frees memory.`,
    );
  if (i.uptimeHours > 24 * 5)
    tips.push(
      `The PC hasn't restarted in ${Math.round(i.uptimeHours / 24)} days. A restart clears leaks and finishes updates.`,
    );
  for (const d of i.disks)
    if (d.freePct < 15)
      tips.push(
        `Drive ${d.mount} is ${100 - Math.round(d.freePct)}% full. Free some space (Storage tab › Free up space): Windows slows down when the system drive is nearly full.`,
      );
  if (/saver/i.test(i.powerPlan ?? ''))
    tips.push(
      'The power plan is Power saver, which caps performance. Switch to Balanced or High performance when plugged in.',
    );
  if (i.memUsedPct > 80) {
    const top = i.topMemory
      .slice(0, 3)
      .map((t) => `${t.name} (${t.gb.toFixed(1)} GB)`)
      .join(', ');
    tips.push(
      `Memory is ${Math.round(i.memUsedPct)}% used${top ? `; biggest users: ${top}` : ''}. Closing some, or browser tabs, will help.`,
    );
  }
  if (!tips.length)
    tips.push(
      'Nothing obvious to fix: startup, disk space, memory and power settings all look fine.',
    );
  return tips;
}

/* ── Benchmark ───────────────────────────────────────────────────────────── */

export interface BenchResult {
  at: number;
  cpuSingleMBs: number;
  diskWriteMBs: number;
  diskReadMBs: number;
  memoryGBs: number;
}

/** About 5 seconds: hashing speed (one core), disk write/read of 256 MB, memory copy. */
export function runBenchmark(tmpDir: string, now = Date.now()): BenchResult {
  // CPU: SHA-256 over 64 KB blocks for ~1.5 s.
  const block = Buffer.alloc(64 * 1024, 7);
  let bytes = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < 1500) {
    createHash('sha256').update(block).digest();
    bytes += block.length;
  }
  const cpuSingleMBs = bytes / 1024 ** 2 / ((performance.now() - t0) / 1000);

  // Disk: 256 MB written with fsync, then read back.
  const file = join(tmpDir, `alton-bench-${now}.bin`);
  const chunk = Buffer.alloc(4 * 1024 * 1024, 1);
  const total = 64;
  let diskWriteMBs: number;
  let diskReadMBs: number;
  try {
    const w0 = performance.now();
    const fd = openSync(file, 'w');
    for (let i = 0; i < total; i++) writeSync(fd, chunk);
    fsyncSync(fd);
    closeSync(fd);
    diskWriteMBs = (total * 4) / ((performance.now() - w0) / 1000);
    const r0 = performance.now();
    const rd = openSync(file, 'r');
    const into = Buffer.alloc(chunk.length);
    while (readSync(rd, into, 0, into.length, null) > 0) {
      /* read */
    }
    closeSync(rd);
    diskReadMBs = (total * 4) / ((performance.now() - r0) / 1000);
  } finally {
    rmSync(file, { force: true });
  }

  // Memory: copy a 256 MB buffer a few times.
  const big = Buffer.alloc(256 * 1024 * 1024, 3);
  const dst = Buffer.allocUnsafe(big.length);
  const m0 = performance.now();
  for (let i = 0; i < 4; i++) big.copy(dst);
  const memoryGBs = (4 * 0.25) / ((performance.now() - m0) / 1000);

  const r = (n: number): number => Math.round(n);
  return {
    at: now,
    cpuSingleMBs: r(cpuSingleMBs),
    diskWriteMBs: r(diskWriteMBs),
    diskReadMBs: r(diskReadMBs),
    memoryGBs: Math.round(memoryGBs * 10) / 10,
  };
}

/** Compare with the last run: "+12%" style changes. */
export function compareBench(
  now: BenchResult,
  prev: BenchResult | undefined,
): Record<string, string> | null {
  if (!prev) return null;
  const pct = (a: number, b: number): string =>
    b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}%` : 'n/a';
  return {
    since: new Date(prev.at).toLocaleDateString(),
    cpu: pct(now.cpuSingleMBs, prev.cpuSingleMBs),
    diskWrite: pct(now.diskWriteMBs, prev.diskWriteMBs),
    diskRead: pct(now.diskReadMBs, prev.diskReadMBs),
    memory: pct(now.memoryGBs, prev.memoryGBs),
  };
}

/** Simple JSON list file helpers. */
export function readList<T>(file: string): T[] {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    return Array.isArray(raw) ? (raw as T[]) : [];
  } catch {
    return [];
  }
}
export function writeList<T>(file: string, list: T[]): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(list));
  } catch {
    /* not fatal */
  }
}
