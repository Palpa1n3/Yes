/** Sandboxed development (Phase 3, item 4): Alton makes a separate copy of its own project
 *  (a local git clone outside the project folder; dependencies linked, not copied), changes
 *  files only there (shared/sandbox-rules.ts says which), runs the project's own checks there
 *  (typecheck, lint, tests: fixed commands, never ones the AI chose), and shows the diff.
 *  The real project folder is never written. Running changed code needs the user's OK once per
 *  copy (it runs with the user's permissions). Throwing the copy away deletes only it. */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';

const lstatOk = (p: string): boolean => {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
};
import { dirname, join, resolve } from 'node:path';
import { SANDBOX_CHECKS, applyEdit, blockedPath, checkSummary } from '@shared/sandbox-rules';
import { isAltonProject, run as defaultRun, type Run } from './project-update';

export interface SandboxCheck {
  name: string;
  ok: boolean;
  summary: string;
  ms: number;
}

export class DevSandbox {
  private dir: string | null = null;
  private changed = new Set<string>();
  private allowedToRun = false;
  private lastChecks: SandboxCheck[] = [];

  constructor(
    private readonly d: {
      /** Where copies go (inside Alton's data folder, never the project). */
      root: string;
      projectDir(): string;
      /** The user's OK to run changed code (once per copy). */
      approve(title: string, detail: string): Promise<boolean>;
      exec?: Run;
      now?: () => number;
    },
  ) {}

  private exec(): Run {
    return this.d.exec ?? defaultRun;
  }

  /** The copy's folder, if one is open. */
  current(): string | null {
    return this.dir;
  }

  private inside(p: string): string {
    if (!this.dir) throw new Error('No development copy yet: use action "start" first.');
    const why = blockedPath(p);
    if (why) throw new Error(why);
    const abs = resolve(this.dir, p.replace(/\\/g, '/'));
    if (!abs.startsWith(resolve(this.dir))) throw new Error('Only paths inside the copy.');
    return abs;
  }

  async start(): Promise<{ ok: boolean; message: string; dir?: string }> {
    const project = this.d.projectDir();
    if (!isAltonProject(project))
      return {
        ok: false,
        message:
          'Set the Alton project folder first (Settings › Connections › Phone companion › Alton project folder, or Settings › Advanced › Source folder).',
      };
    await this.discard();
    const dir = join(this.d.root, `copy-${(this.d.now?.() ?? Date.now()).toString(36)}`);
    mkdirSync(this.d.root, { recursive: true });
    const r = await this.exec()(
      'git',
      ['clone', '--quiet', '--local', '--no-hardlinks', project, dir],
      {
        timeout: 180_000,
      },
    );
    if (r.code !== 0)
      return { ok: false, message: `Couldn't copy the project: ${r.out.slice(-400)}` };
    // Dependencies: linked from the project (installing them again would take minutes).
    const nm = join(project, 'node_modules');
    if (existsSync(nm))
      try {
        symlinkSync(nm, join(dir, 'node_modules'), 'junction');
      } catch {
        /* checks will say what's missing */
      }
    this.dir = dir;
    this.changed.clear();
    this.allowedToRun = false;
    this.lastChecks = [];
    return {
      ok: true,
      message: 'Made a fresh development copy of the project (from its last commit).',
      dir,
    };
  }

  read(path: string, from = 1, to?: number): { path: string; total: number; lines: string } {
    const abs = this.inside(path);
    if (!existsSync(abs)) throw new Error(`No file ${path} in the copy.`);
    if (statSync(abs).size > 600 * 1024) throw new Error('That file is too big to read.');
    const all = readFileSync(abs, 'utf8').split('\n');
    const end = Math.min(all.length, to ?? from + 399);
    return {
      path,
      total: all.length,
      lines: all
        .slice(from - 1, end)
        .map((l, i) => `${from + i}\t${l}`)
        .join('\n'),
    };
  }

  write(path: string, content: string): string {
    const abs = this.inside(path);
    if (content.length > 400 * 1024) throw new Error('That is too much for one file.');
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    this.changed.add(path.replace(/\\/g, '/'));
    return `Wrote ${path} in the copy.`;
  }

  edit(path: string, find: string, replace: string): string {
    const abs = this.inside(path);
    if (!existsSync(abs)) throw new Error(`No file ${path} in the copy.`);
    const r = applyEdit(readFileSync(abs, 'utf8'), find, replace);
    if ('error' in r) throw new Error(r.error);
    writeFileSync(abs, r.text);
    this.changed.add(path.replace(/\\/g, '/'));
    return `Changed ${path} in the copy.`;
  }

  remove(path: string): string {
    const abs = this.inside(path);
    rmSync(abs, { force: true });
    this.changed.add(path.replace(/\\/g, '/'));
    return `Deleted ${path} in the copy.`;
  }

  /** Run the project's own checks in the copy (asks the user first, once per copy). */
  async check(): Promise<{ ok: boolean; checks: SandboxCheck[] } | { error: string }> {
    if (!this.dir) return { error: 'No development copy yet: use action "start" first.' };
    if (!this.allowedToRun) {
      const ok = await this.d.approve(
        'Let Alton run its checks on its changed copy?',
        `Alton changed ${this.changed.size} file${this.changed.size === 1 ? '' : 's'} in a separate copy of its project (${[...this.changed].slice(0, 6).join(', ') || 'none yet'}). Running the typecheck, lint and tests runs that changed code on this PC with your permissions. Your real project isn't touched.`,
      );
      if (!ok) return { error: "The user didn't allow running the checks." };
      this.allowedToRun = true;
    }
    const checks: SandboxCheck[] = [];
    for (const c of SANDBOX_CHECKS) {
      const t = this.d.now?.() ?? Date.now();
      const r = await this.exec()('cmd.exe', ['/d', '/s', '/c', c.command], {
        cwd: this.dir,
        timeout: c.timeoutMs,
        env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
      });
      checks.push({
        name: c.name,
        ok: r.code === 0,
        summary: checkSummary(r.out),
        ms: (this.d.now?.() ?? Date.now()) - t,
      });
      if (r.code !== 0) break; // later checks would only repeat the failure
    }
    this.lastChecks = checks;
    return { ok: checks.length === SANDBOX_CHECKS.length && checks.every((c) => c.ok), checks };
  }

  /** What changed in the copy, against the project's last commit. */
  async diff(): Promise<
    { stat: string; diff: string; changed: string[]; checks: SandboxCheck[] } | { error: string }
  > {
    if (!this.dir) return { error: 'No development copy yet.' };
    await this.exec()('git', ['add', '-A', '--', '.', ':!node_modules'], {
      cwd: this.dir,
      timeout: 60_000,
    });
    const stat = await this.exec()('git', ['diff', '--cached', '--stat'], {
      cwd: this.dir,
      timeout: 60_000,
    });
    const diff = await this.exec()('git', ['diff', '--cached'], { cwd: this.dir, timeout: 60_000 });
    return {
      stat: stat.out.slice(-4000),
      diff: diff.out.slice(0, 40_000),
      changed: [...this.changed],
      checks: this.lastChecks,
    };
  }

  async discard(): Promise<string> {
    const dir = this.dir;
    this.dir = null;
    this.changed.clear();
    this.allowedToRun = false;
    if (!dir) return 'There was no development copy.';
    // The node_modules link goes first (as a link: never followed into the project's folder).
    const link = join(dir, 'node_modules');
    if (existsSync(link) || lstatOk(link)) {
      try {
        if (lstatSync(link).isSymbolicLink()) unlinkSync(link);
        else rmdirSync(link);
      } catch {
        return `Couldn't remove the dependencies link in ${dir}, so the copy was left there to be safe (delete it by hand).`;
      }
      if (lstatOk(link))
        return `The dependencies link in ${dir} is still there, so the copy was left to be safe.`;
    }
    rmSync(dir, { recursive: true, force: true });
    return 'Threw away the development copy.';
  }

  /** The dev_sandbox tool. */
  async tool(input: unknown): Promise<unknown> {
    const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    const s = (k: string): string => (typeof o[k] === 'string' ? (o[k] as string) : '');
    try {
      switch (s('action')) {
        case 'start':
          return await this.start();
        case 'read':
          return this.read(s('path'), Number(o.from) || 1, Number(o.to) || undefined);
        case 'write':
          return { result: this.write(s('path'), s('content')) };
        case 'edit':
          return { result: this.edit(s('path'), s('find'), s('replace')) };
        case 'delete':
          return { result: this.remove(s('path')) };
        case 'check':
          return await this.check();
        case 'diff':
          return await this.diff();
        case 'discard':
          return { result: await this.discard() };
        default:
          return {
            error: 'action must be start, read, write, edit, delete, check, diff or discard.',
          };
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
}
