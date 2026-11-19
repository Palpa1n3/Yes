import { Check, ShieldAlert, X } from 'lucide-react';
import { useEffect } from 'react';
import { create } from 'zustand';
import type { ApprovalRequest } from '@shared/ipc';
import { useConversationStore } from '@renderer/stores/conversationStore';

export const useApprovalStore = create<{ items: ApprovalRequest[] }>(() => ({ items: [] }));

export function bindApprovals(): () => void {
  const off1 = window.arc.approval.onRequest((r) => {
    useApprovalStore.setState((s) => ({ items: [...s.items, r] }));
    useConversationStore.getState().pushAssistant(`Can I go ahead? ${r.title}`);
  });
  const off2 = window.arc.approval.onResolved((id) =>
    useApprovalStore.setState((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  );
  return () => {
    off1();
    off2();
  };
}

/** "yes"/"no" typed or said while a card is waiting answers the oldest one. */
export function approvalIntercept(text: string): boolean {
  const first = useApprovalStore.getState().items[0];
  if (!first) return false;
  const t = text.trim().replace(/[.!]+$/, '');
  if (/^(yes|yeah|yep|ok(ay)?|sure|go ahead|do it|approve[d]?)\b/i.test(t))
    window.arc.approval.answer(first.id, true);
  else if (/^(no|nope|don'?t|cancel|deny|stop)\b/i.test(t))
    window.arc.approval.answer(first.id, false);
  else return false;
  return true;
}

export function ApprovalCards() {
  const items = useApprovalStore((s) => s.items);
  useEffect(() => undefined, []);
  if (!items.length) return null;
  return (
    <div className="fixed bottom-10 left-4 z-50 flex w-[380px] flex-col gap-2">
      {items.map((r) => (
        <section
          key={r.id}
          aria-label="Needs your approval"
          className="rounded-[8px] border border-amber/70 bg-panel/95 p-3 shadow-glow-sm backdrop-blur"
        >
          <header className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-amber">
            <ShieldAlert size={13} /> Needs your OK
          </header>
          <p className="text-[13px] text-text-primary">{r.title}</p>
          {r.detail && (
            <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] text-text-muted">
              {r.detail}
            </pre>
          )}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="hud-button flex-1"
              onClick={() => window.arc.approval.answer(r.id, true)}
            >
              <Check size={12} /> Approve
            </button>
            <button
              type="button"
              className="hud-button flex-1 !border-alert/60 !text-alert"
              onClick={() => window.arc.approval.answer(r.id, false)}
            >
              <X size={12} /> Deny
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}
