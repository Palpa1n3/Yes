/** Encrypted backups to another drive or folder (safety gate 5): daily when a folder is chosen,
 *  plus Back up now, a new recovery code, and restore (Settings › Privacy › Backups). */
import { join } from 'node:path';
import { app, dialog, safeStorage } from 'electron';
import { IPC, type OffsiteResult, type OffsiteStatus } from '@shared/ipc';
import type { MainContext } from '../context';
import { DataBackup } from '../services/data-backup';
import { OffsiteBackup, sameDrive } from '../services/offsite-backup';
import { SecretStore } from '../services/secret-store';
import { handle } from './handle';

export function registerOffsiteIpc(ctx: MainContext): void {
  const userData = app.getPath('userData');
  const keyStore = new SecretStore(join(userData, 'offsite-key.bin'), safeStorage);
  const svc = new OffsiteBackup({
    userData,
    folder: () => ctx.settings.get().offsiteFolder,
    keys: { get: () => keyStore.get(), set: (v) => keyStore.set(v) },
    backupCurrent: () => void new DataBackup(userData).backup('before-restore'),
  });
  let last: OffsiteStatus['last'] = null;

  const status = (): OffsiteStatus => {
    const folder = ctx.settings.get().offsiteFolder;
    return {
      folder,
      sameDrive: !!folder && sameDrive(folder, userData),
      problem: folder ? svc.folderProblem() : null,
      copies: svc.list(),
      last,
    };
  };

  const record = (r: OffsiteResult, why: string): OffsiteResult => {
    last = { at: Date.now(), ok: r.ok, message: r.message };
    ctx.audit.add('action', `${why}: ${r.message}`, r.ok);
    if (!r.ok) {
      ctx.errors.add('warn', 'backup', r.message);
      ctx.notify(r.message);
    }
    return r;
  };

  // Daily: when a folder is set and today's copy isn't there yet.
  const daily = async (): Promise<void> => {
    if (!ctx.settings.get().offsiteFolder) return;
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (svc.list().some((c) => c.day === today)) return;
    record(await svc.run(), 'Encrypted backup');
  };
  setTimeout(() => void daily(), 3 * 60_000).unref?.();
  setInterval(() => void daily(), 4 * 3600_000).unref?.();

  handle(IPC.offsite.status, () => status());
  handle(IPC.offsite.pickFolder, async () => {
    const win = ctx.getWindow();
    const opts = {
      title: 'Choose where encrypted backups go (ideally another drive or a USB stick)',
      properties: ['openDirectory' as const, 'createDirectory' as const],
    };
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    const dir = r.canceled ? '' : (r.filePaths[0] ?? '');
    if (!dir) return { status: status(), result: null };
    const problem = svc.folderProblem(dir);
    if (problem) return { status: status(), result: { ok: false, message: problem } };
    ctx.updateSettings({ offsiteFolder: dir });
    const res = record(await svc.run(), 'Encrypted backup');
    return { status: status(), result: res };
  });
  handle(IPC.offsite.run, async () => {
    const res = record(await svc.run(), 'Encrypted backup');
    return { status: status(), result: res };
  });
  handle(IPC.offsite.newCode, async () => {
    const res = record(await svc.newCode(), 'New backup recovery code');
    return { status: status(), result: res };
  });
  handle(IPC.offsite.restore, async (file, code) => {
    const res = record(
      await svc.restore(String(file), typeof code === 'string' ? code : undefined),
      'Restore from encrypted backup',
    );
    if (res.ok)
      setTimeout(() => {
        app.relaunch();
        ctx.quit();
      }, 800);
    return res;
  });
  handle(IPC.offsite.turnOff, () => {
    ctx.updateSettings({ offsiteFolder: '' });
    return status();
  });
}
