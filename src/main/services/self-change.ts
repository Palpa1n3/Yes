/** Approval-based code changes (Phase 3, item 6): a change Alton made and checked in its
 *  development copy goes into the real project only like this:
 *  1. the copy is ready (every check ran after the last edit; nothing new failed);
 *  2. the real project has no uncommitted work and is at the commit the copy started from;
 *  3. the user approves it (what it does, which files, the check results);
 *  4. the patch is applied, and what git staged is compared with exactly the files Alton
 *     changed (safety gate 2): any difference undoes it;
 *  5. it's committed as an "Alton self-change";
 *  6. pushing to GitHub (which starts a release build) is a separate approval.
 *  Undo: an Alton self-change can be reverted (with approval). Nothing here runs without a "yes". */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareChanges, describeMismatch, parseGitChanges, type Change } from '@shared/intended';
import type { DevSandbox } from './dev-sandbox';
import { cleanMessage, isAltonProject, run as defaultRun, type Run } from './project-update';

export const SELF_CHANGE_PREFIX = 'Alton self-change: ';

export class SelfChange {
  /** The last self-change committed but not pushed yet. */
  private unpushed: string | null = null;

  constructor(
    private readonly d: {
      sandbox: DevSandbox;
      projectDir(): string;
      approve(title: string, detail: string): Promise<boolean>;
      exec?: Run;
      audit?(text: string, ok: boolean): void;
    },
  ) {}

  private git(args: string[], timeout = 60_000) {
    return (this.d.exec ?? defaultRun)('git', args, { cwd: this.d.projectDir(), timeout });
  }

  async apply(message: string): Promise<{ ok: boolean; message: string; commit?: string }> {
    const sb = this.d.sandbox;
    const ready = sb.ready();
    if (!ready.ok) return { ok: false, message: `Not ready to apply: ${ready.why}` };
    const project = this.d.projectDir();
    if (!isAltonProject(project))
      return {
        ok: false,
        message: 'The Alton project folder isn’t set, or isn’t an Alton git folder.',
      };
    const status = await this.git(['status', '--porcelain']);
    if (status.code !== 0)
      return { ok: false, message: `git status failed: ${status.out.slice(-300)}` };
    if (parseGitChanges(status.out).length)
      return {
        ok: false,
        message:
          'Your project has changes that aren’t committed yet, so nothing was applied (your own work is never mixed in). Commit or undo them first.',
      };
    const head = (await this.git(['rev-parse', 'HEAD'])).out.trim();
    if (!head || head !== ready.result.commit)
      return {
        ok: false,
        message:
          'The project has moved on since the development copy was made, so the change was tested against an older version. Start a fresh copy, redo and check the change, then apply.',
      };
    const patch = await sb.patch();
    const intended: Change[] = parseGitChanges(await sb.nameStatus());
    if (!patch.trim()) return { ok: false, message: 'The copy has no changes to apply.' };

    const summary = cleanMessage(message).replace(/^Alton update from my phone$/, 'Improvement');
    const t = ready.result.tests;
    const ok = await this.d.approve(
      `Apply Alton's change to your project? ${summary}`,
      `Files: ${ready.changed.join(', ')}\n\nChecked in a separate copy: typecheck and lint passed; ${
        t ? `${t.passed} of ${t.total} tests passed, nothing new failing` : 'tests ran'
      }.\n\nIt is committed to your project folder (not pushed yet: that's asked separately). You can undo it afterwards.`,
    );
    if (!ok) return { ok: false, message: 'The user said no; the project is unchanged.' };

    const dir = mkdtempSync(join(tmpdir(), 'alton-patch-'));
    const file = join(dir, 'change.patch');
    try {
      writeFileSync(file, patch);
      const check = await this.git(['apply', '--check', '--whitespace=nowarn', file]);
      if (check.code !== 0)
        return { ok: false, message: `The change doesn't apply cleanly: ${check.out.slice(-400)}` };
      const applied = await this.git(['apply', '--index', '--whitespace=nowarn', file]);
      if (applied.code !== 0) {
        await this.undoUncommitted();
        return {
          ok: false,
          message: `Applying failed, so it was undone: ${applied.out.slice(-400)}`,
        };
      }
      // Gate 2: exactly the files Alton changed, nothing else.
      const staged = await this.git(['diff', '--cached', '--name-status']);
      const c = compareChanges(intended, parseGitChanges(staged.out));
      if (!c.ok || staged.code !== 0) {
        await this.undoUncommitted();
        return {
          ok: false,
          message: `${describeMismatch('Applying the change', c)} It was undone.`,
        };
      }
      const commit = await this.git([
        'commit',
        '-m',
        `${SELF_CHANGE_PREFIX}${summary}`,
        '-m',
        'Made and checked by Alton in its development copy; approved by the owner.',
      ]);
      if (commit.code !== 0) {
        await this.undoUncommitted();
        return {
          ok: false,
          message: `Committing failed, so it was undone: ${commit.out.slice(-300)}`,
        };
      }
      const sha = (await this.git(['rev-parse', 'HEAD'])).out.trim();
      this.unpushed = sha;
      this.d.audit?.(
        `Alton changed its own code (approved): ${summary} [${sha.slice(0, 7)}]`,
        true,
      );
      await sb.discard();
      return {
        ok: true,
        commit: sha,
        message: `Applied and committed (${sha.slice(0, 7)}). Not pushed yet: use action "push" to send it to GitHub, or "revert" to undo it.`,
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  /** Back to the last commit, for a project that was clean before (only Alton's staged change). */
  private async undoUncommitted(): Promise<void> {
    await this.git(['reset', '--hard', '-q', 'HEAD']);
  }

  async push(): Promise<{ ok: boolean; message: string }> {
    if (!this.unpushed)
      return { ok: false, message: 'There is no applied self-change waiting to be pushed.' };
    const ok = await this.d.approve(
      'Push Alton’s change to GitHub?',
      `Commit ${this.unpushed.slice(0, 7)}. This starts a new build and release (about 10–15 minutes); the PC and phone apps then offer the update.`,
    );
    if (!ok)
      return { ok: false, message: 'Not pushed. It stays committed in your project folder.' };
    const r = await this.git(['push'], 180_000);
    if (r.code !== 0) return { ok: false, message: `git push failed: ${r.out.slice(-400)}` };
    this.d.audit?.(`Pushed Alton's self-change ${this.unpushed.slice(0, 7)} to GitHub`, true);
    this.unpushed = null;
    return { ok: true, message: 'Pushed. The build starts now.' };
  }

  /** Undo the latest Alton self-change (a new commit that reverses it). */
  async revert(): Promise<{ ok: boolean; message: string }> {
    const log = await this.git(['log', '-1', '--format=%H%n%s']);
    const [sha = '', subject = ''] = log.out.trim().split('\n');
    if (!subject.startsWith(SELF_CHANGE_PREFIX))
      return {
        ok: false,
        message: 'The latest commit isn’t an Alton self-change, so nothing was undone.',
      };
    const status = await this.git(['status', '--porcelain']);
    if (parseGitChanges(status.out).length)
      return {
        ok: false,
        message: 'Your project has uncommitted changes; commit or undo them first.',
      };
    const ok = await this.d.approve(
      'Undo Alton’s last change to its code?',
      `${subject} (${sha.slice(0, 7)}). A new commit reverses it; nothing is pushed.`,
    );
    if (!ok) return { ok: false, message: 'Not undone.' };
    const r = await this.git(['revert', '--no-edit', sha]);
    if (r.code !== 0) {
      await this.git(['revert', '--abort']);
      return { ok: false, message: `Undoing failed: ${r.out.slice(-300)}` };
    }
    if (this.unpushed === sha) this.unpushed = null;
    this.d.audit?.(`Undid Alton's self-change ${sha.slice(0, 7)}`, true);
    return { ok: true, message: `Undone with a new commit. Not pushed.` };
  }

  /** The apply_self_change tool. */
  async tool(input: unknown): Promise<unknown> {
    const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    const action = typeof o.action === 'string' ? o.action : '';
    if (action === 'apply')
      return this.apply(typeof o.message === 'string' ? o.message : 'Improvement');
    if (action === 'push') return this.push();
    if (action === 'revert') return this.revert();
    return { error: 'action must be apply, push or revert.' };
  }
}
