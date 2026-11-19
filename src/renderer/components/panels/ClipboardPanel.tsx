import { Check, ClipboardCopy, EyeOff, X } from 'lucide-react';
import { useState } from 'react';
import { useClipboardStore } from '@renderer/stores/clipboardStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { Chip } from './Chip';
import { clipAction } from '@shared/clipboard';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { Panel } from './Panel';

/** Recent copies: click one to copy it again. Memory only, cleared when ARC quits. */
export function ClipboardPanel({ className = '' }: { className?: string }) {
  const items = useClipboardStore((s) => s.items);
  const on = useSettingsStore((s) => s.settings.clipboardHistory);
  const [copied, setCopied] = useState<string | null>(null);
  const [reveal, setReveal] = useState<string | null>(null);
  return (
    <Panel
      code="NTS.05"
      title="Clipboard"
      chip={
        items.length ? (
          <button
            type="button"
            onClick={() =>
              void window.arc.clipboard
                .clear()
                .then((i) => useClipboardStore.setState({ items: i }))
            }
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted hover:text-alert"
          >
            Clear
          </button>
        ) : (
          <Chip tone="muted">{on ? 'Empty' : 'Off'}</Chip>
        )
      }
      className={className}
      bodyClassName="flex min-h-0 flex-col !py-2"
    >
      {!on ? (
        <p className="text-[12px] text-text-muted">
          Clipboard history is off (Settings › Smart features).
        </p>
      ) : !items.length ? (
        <p className="text-[12px] text-text-muted">
          Things you copy show here so you can copy them again. Kept in memory only.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto" aria-label="Recent copies">
          {items.map((c) => (
            <li
              key={c.id}
              className="group flex items-start gap-1.5 border-b border-line/30 py-1 text-[12px]"
            >
              <button
                type="button"
                title="Copy again"
                onClick={() =>
                  void window.arc.clipboard.copy(c.id).then(() => {
                    setCopied(c.id);
                    setTimeout(() => setCopied(null), 1200);
                  })
                }
                className="flex min-w-0 flex-1 items-start gap-1.5 text-left hover:text-accent"
              >
                {copied === c.id ? (
                  <Check size={12} className="mt-0.5 shrink-0 text-ok" />
                ) : (
                  <ClipboardCopy size={12} className="mt-0.5 shrink-0 text-text-muted" />
                )}
                <span
                  className={`line-clamp-2 min-w-0 break-all ${c.sensitive && reveal !== c.id ? 'select-none blur-[4px]' : ''}`}
                >
                  {c.text}
                </span>
              </button>
              {!c.sensitive &&
                (() => {
                  const a = clipAction(c.text);
                  if (!a) return null;
                  return (
                    <button
                      type="button"
                      className="shrink-0 rounded-[4px] border border-line/70 px-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-text-muted hover:border-accent hover:text-accent"
                      onClick={() =>
                        a.url
                          ? window.arc.app.openUrl(a.url)
                          : a.ask && void useConversationStore.getState().send(a.ask)
                      }
                    >
                      {a.label}
                    </button>
                  );
                })()}
              {c.sensitive && (
                <button
                  type="button"
                  aria-label="Show"
                  title="Looks like a password: hidden from Claude"
                  onClick={() => setReveal(reveal === c.id ? null : c.id)}
                  className="text-amber"
                >
                  <EyeOff size={12} />
                </button>
              )}
              <button
                type="button"
                aria-label="Remove"
                onClick={() =>
                  void window.arc.clipboard
                    .remove(c.id)
                    .then((i) => useClipboardStore.setState({ items: i }))
                }
                className="text-text-muted opacity-0 hover:text-alert focus:opacity-100 group-hover:opacity-100"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
