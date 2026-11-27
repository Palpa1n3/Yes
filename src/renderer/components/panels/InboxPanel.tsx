import { ExternalLink, Mail } from 'lucide-react';
import { senderName } from '@shared/email';
import { useEmailStore } from '@renderer/stores/emailStore';
import { Chip } from './Chip';
import { Panel } from './Panel';

const when = (t: number): string => {
  const d = new Date(t);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

/** Newest messages from the connected email account (read-only). Hidden until connected. */
export function InboxPanel({ className = '' }: { className?: string }) {
  const { configured, unread, recent, error, provider, webmail } = useEmailStore();
  const site = webmail || 'https://mail.google.com/';
  const name = provider || 'your email';
  if (!configured) return null;
  return (
    <Panel
      code="EML.07"
      title="Inbox"
      chip={
        <span className="flex items-center gap-2">
          {error ? (
            <Chip tone="amber">Offline</Chip>
          ) : (
            <span
              className={`inline-flex h-5 items-center whitespace-nowrap border px-1.5 font-mono text-[10px] tracking-[0.08em] ${unread ? 'border-accent/60 bg-accent/5 text-accent' : 'border-line text-text-muted'}`}
            >
              {unread} new
            </span>
          )}
          <button
            type="button"
            aria-label={`Open ${name}`}
            title={`Open ${name}`}
            onClick={() => window.arc.app.openUrl(site)}
            className="text-text-muted hover:text-accent"
          >
            <ExternalLink size={12} />
          </button>
        </span>
      }
      className={className}
      bodyClassName="flex min-h-0 flex-col overflow-y-auto !py-1.5"
    >
      {error ? (
        <p className="text-[12px] text-amber">{error}</p>
      ) : !recent.length ? (
        <p className="text-[12px] text-text-muted">Inbox empty.</p>
      ) : (
        <ul aria-label="Recent email">
          {recent.slice(0, 6).map((e) => (
            <li
              key={e.uid}
              className="flex items-start gap-2 border-b border-line/30 py-1 text-[12px] last:border-0"
              title={`${e.from}\n${e.subject}`}
            >
              <Mail
                size={12}
                className={`mt-0.5 shrink-0 ${e.unread ? 'text-accent' : 'text-text-muted/50'}`}
              />
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate ${e.unread ? 'font-semibold text-ice' : 'text-text-primary'}`}
                >
                  {senderName(e.from)}
                </span>
                <span className="block truncate text-text-muted">{e.subject}</span>
              </span>
              <span className="numeric shrink-0 text-[10px] text-text-muted">{when(e.date)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
