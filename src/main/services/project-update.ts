/** "Update Alton from my phone": unpack an Alton zip over the project folder, then git add,
 *  commit and push. Only these fixed steps, only in the chosen folder (no other commands). */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface Run {
  (
    file: string,
    args: string[],
    opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeout: number },
  ): Promise<{
    code: number;
    out: string;
  }>;
}

export const run: Run = (file, args, opts) =>
  new Promise((resolve) => {
    execFile(
      file,
      args,
      { ...opts, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = err
          ? typeof (err as { code?: unknown }).code === 'number'
            ? (err as { code: number }).code
            : 1
          : 0;
        resolve({ code, out: `${stdout}${stderr}`.trim() });
      },
    );
  });

/** Is this folder an Alton project with git? */
export function isAltonProject(dir: string): boolean {
  try {
    if (!dir || !existsSync(join(dir, '.git'))) return false;
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: string };
    return pkg.name === 'arc';
  } catch {
    return false;
  }
}

export const cleanMessage = (m: string): string =>
  m
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\w .,:;!?()'+\-–/#&]/g, '')
    .trim()
    .slice(0, 120) || 'Alton update from my phone';

export async function applyProjectUpdate(
  zip: string,
  projectDir: string,
  message: string,
  exec: Run = run,
): Promise<{ ok: boolean; log: string }> {
  const log: string[] = [];
  if (!isAltonProject(projectDir))
    return {
      ok: false,
      log: 'The Alton project folder isn’t set, or isn’t an Alton git folder. Set it on the PC: Settings › Connections › Phone companion.',
    };
  if (!existsSync(zip) || !/\.zip$/i.test(zip)) return { ok: false, log: 'That file isn’t a zip.' };
  const tmp = join(tmpdir(), `arc-update-${Date.now()}`);
  try {
    // 1 · Unpack
    const ex = await exec(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Expand-Archive -LiteralPath $env:ARC_ZIP -DestinationPath $env:ARC_TMP -Force',
      ],
      { env: { ...process.env, ARC_ZIP: zip, ARC_TMP: tmp }, timeout: 120_000 },
    );
    if (ex.code !== 0) return { ok: false, log: `Couldn’t unpack the zip:\n${ex.out}` };
    const root = existsSync(join(tmp, 'arc', 'package.json')) ? join(tmp, 'arc') : tmp;
    if (!isZipAlton(root))
      return { ok: false, log: 'That zip isn’t an Alton project (no package.json for “arc”).' };
    log.push('✓ Unpacked the zip');
    // 2 · Copy over the project (never .git, node_modules or build folders)
    const cp = await exec(
      'robocopy',
      [
        root,
        projectDir,
        '/E',
        '/XD',
        '.git',
        'node_modules',
        'dist',
        'out',
        '/NFL',
        '/NDL',
        '/NJH',
        '/NJS',
        '/NP',
      ],
      { timeout: 120_000 },
    );
    if (cp.code >= 8) return { ok: false, log: `${log.join('\n')}\nCopying failed:\n${cp.out}` };
    log.push('✓ Copied the new files into the project');
    // 3 · git add, commit, push
    const add = await exec('git', ['add', '-A'], { cwd: projectDir, timeout: 60_000 });
    if (add.code !== 0) return { ok: false, log: `${log.join('\n')}\ngit add failed:\n${add.out}` };
    const commit = await exec('git', ['commit', '-m', cleanMessage(message)], {
      cwd: projectDir,
      timeout: 60_000,
    });
    if (commit.code !== 0) {
      if (/nothing to commit|no changes added/i.test(commit.out))
        return {
          ok: true,
          log: `${log.join('\n')}\nNothing had changed, so there was nothing to push.`,
        };
      return { ok: false, log: `${log.join('\n')}\ngit commit failed:\n${commit.out}` };
    }
    log.push(`✓ Committed: ${commit.out.split('\n')[0] ?? ''}`);
    const push = await exec('git', ['push'], { cwd: projectDir, timeout: 180_000 });
    if (push.code !== 0)
      return { ok: false, log: `${log.join('\n')}\ngit push failed:\n${push.out}` };
    log.push('✓ Pushed to GitHub. The builds start now (about 10–15 minutes).');
    return { ok: true, log: log.join('\n') };
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* temp folder */
    }
  }
}

function isZipAlton(dir: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: string };
    return pkg.name === 'arc';
  } catch {
    return false;
  }
}
