import { IPC } from '@shared/ipc';
import type { MainContext } from '../context';
import { emit, on } from './handle';

/** A generic Approve / Deny card for risky steps that aren't ordinary actions
 *  (moving files, posting to Discord…). Unanswered requests are denied after 10 minutes. */
export function registerApprovalIpc(ctx: MainContext): void {
  const pending = new Map<string, (ok: boolean) => void>();
  const open = new Map<string, { id: string; title: string; detail: string }>();
  let seq = 0;
  ctx.askApproval = (title, detail = '') =>
    new Promise<boolean>((resolve) => {
      const id = `ap-${++seq}`;
      const timer = setTimeout(() => finish(false), 10 * 60_000);
      const finish = (ok: boolean): void => {
        clearTimeout(timer);
        pending.delete(id);
        open.delete(id);
        emit(ctx.getWindow(), IPC.approval.onResolved, id);
        ctx.audit.add('action', `${ok ? 'Approved' : 'Denied'}: ${title}`, ok);
        resolve(ok);
      };
      pending.set(id, finish);
      open.set(id, { id, title, detail: detail.slice(0, 1000) });
      ctx.peekWindow();
      ctx.notify(`Needs your OK: ${title}`);
      emit(ctx.getWindow(), IPC.approval.onRequest, { id, title, detail: detail.slice(0, 4000) });
    });
  ctx.pendingApprovals = () => [...open.values()];
  ctx.answerApproval = (id, ok) => pending.get(id)?.(ok);
  on(IPC.approval.answer, (_w, id, ok) => pending.get(String(id))?.(ok === true), ctx.getWindow);
}
