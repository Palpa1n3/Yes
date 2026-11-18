import { Ban, Check, LoaderCircle, ShieldQuestion, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { fmtClock } from '@renderer/lib/format';
import {
  describeCommand,
  useConversationStore,
  type CommandInfo,
} from '@renderer/stores/conversationStore';

const STATUS = {
  awaiting: {
    cls: 'border-amber/70 text-amber',
    label: 'Confirm',
    Icon: ShieldQuestion,
    bar: 'border-l-amber',
  },
  pending: {
    cls: 'border-accent/60 text-accent',
    label: 'Pending',
    Icon: LoaderCircle,
    bar: 'border-l-amber',
  },
  success: { cls: 'border-ok/60 text-ok', label: 'Success', Icon: Check, bar: 'border-l-ok' },
  failed: { cls: 'border-alert/70 text-alert', label: 'Failed', Icon: X, bar: 'border-l-alert' },
  cancelled: {
    cls: 'border-line text-text-muted',
    label: 'Cancelled',
    Icon: Ban,
    bar: 'border-l-line',
  },
} as const;

const RISK_TEXT = {
  safe: '',
  sensitive: 'This may change settings or data.',
  destructive: 'This cannot be undone.',
} as const;

/** Inline transcript card for an action ARC runs: "▸ LAUNCHING · Visual Studio Code".
 *  When confirmation is required it shows Approve / Cancel first. */
export function CommandCard({
  id,
  command,
  timestamp,
}: {
  id: string;
  command: CommandInfo;
  timestamp: number;
}) {
  const { approve, reject } = useConversationStore();
  const { verb, target } = describeCommand(command.cmd);
  const s = STATUS[command.status];
  const approveRef = useRef<HTMLButtonElement>(null);
  const awaiting = command.status === 'awaiting';

  // Put focus on Approve so Enter confirms and Esc (below) cancels.
  useEffect(() => {
    if (awaiting) approveRef.current?.focus();
  }, [awaiting]);

  return (
    <div
      className={`my-1 border border-l-2 border-line/60 bg-panel-raised/60 px-3 py-1.5 ${s.bar}`}
      role={awaiting ? 'alertdialog' : 'status'}
      aria-live="polite"
      aria-label={`${verb} ${target}: ${s.label}`}
      onKeyDown={(e) => {
        if (awaiting && e.key === 'Escape') {
          e.stopPropagation();
          reject(id);
        }
      }}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-amber">
          ▸ {verb}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">· {target}</span>
        <span
          className={`inline-flex h-5 items-center gap-1 border px-1.5 font-mono text-[10px] uppercase tracking-[0.12em] ${s.cls}`}
        >
          <s.Icon
            size={11}
            strokeWidth={1.75}
            className={command.status === 'pending' ? 'animate-spin' : ''}
            aria-hidden
          />
          {s.label}
        </span>
        <span className="numeric text-[10px] text-text-muted">{fmtClock(new Date(timestamp))}</span>
      </div>
      {awaiting && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="flex-1 text-[12px] text-text-muted">
            {RISK_TEXT[command.cmd.risk] ||
              'Your personality settings ask me to check before acting.'}
          </span>
          <button
            ref={approveRef}
            type="button"
            className="hud-button !border-ok/60 !text-ok"
            onClick={() => approve(id)}
          >
            <Check size={12} strokeWidth={1.75} /> Approve
          </button>
          <button type="button" className="hud-button" onClick={() => reject(id)}>
            <X size={12} strokeWidth={1.75} /> Cancel
          </button>
        </div>
      )}
      {command.result && (
        <div
          className={`mt-0.5 text-[12px] ${command.status === 'failed' ? 'text-alert/90' : 'text-text-muted'}`}
        >
          {command.result.message}
        </div>
      )}
    </div>
  );
}
