import { JourneyMapCard } from './JourneyMapCard';
import {
  ArrowDown,
  Check,
  Copy,
  FileText,
  Globe,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Volume2,
} from 'lucide-react';
import { speakNow } from '@renderer/voice/useSpeechOutput';

/** Put text in the message box (Edit on your last message). */
export const PREFILL_EVENT = 'arc:prefill';
import type { LinkPreview } from '@shared/preview';
import type { Source } from '@shared/chats';
import { Markdown } from './Markdown';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useConversationStore, type Message } from '@renderer/stores/conversationStore';
import { CommandCard } from './CommandCard';
import { Typewriter } from './Typewriter';

const STICK_PX = 24;
const renderMd = (t: string): ReactNode => <Markdown text={t} />;

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy reply"
      title={done ? 'Copied' : 'Copy'}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className="p-0.5 text-text-muted transition-colors hover:text-accent"
    >
      {done ? <Check size={13} /> : <Copy size={13} strokeWidth={1.5} />}
    </button>
  );
}

const host = (u: string): string => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
};

/** Picture cards for the pages/products an answer links to (like a shopping carousel). */
function LinkCards({ previews }: { previews: LinkPreview[] }) {
  return (
    <div
      className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2"
      aria-label="Links"
    >
      {previews.map((p) => (
        <button
          key={p.url}
          type="button"
          onClick={() => window.arc.app.openUrl(p.url)}
          title={`${p.title}\n${p.url}`}
          className="group flex min-w-0 flex-col overflow-hidden border border-line/70 bg-panel-raised/50 text-left transition-colors hover:border-accent"
        >
          <div className="grid h-24 w-full place-items-center overflow-hidden bg-void/60">
            {p.image ? (
              <img
                src={p.image}
                alt=""
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <Globe size={22} strokeWidth={1.25} className="text-text-muted/60" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 p-2">
            <span className="line-clamp-2 text-[12px] leading-snug text-text-primary group-hover:text-ice">
              {p.title}
            </span>
            <span className="mt-auto flex items-center justify-between gap-2 pt-1 text-[10px]">
              <span className="truncate font-mono uppercase tracking-[0.08em] text-text-muted">
                {p.site}
              </span>
              {p.price && <span className="numeric shrink-0 text-[12px] text-ok">{p.price}</span>}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

function Sources({ sources }: { sources: Source[] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Sources">
      <span className="micro-label">Sources</span>
      {sources.map((s, i) => (
        <button
          key={s.url}
          type="button"
          onClick={() => window.arc.app.openUrl(s.url)}
          title={`${s.title}\n${s.url}`}
          className="flex max-w-[16rem] items-center gap-1 border border-line/70 bg-panel-raised/60 px-1.5 py-0.5 text-[11px] text-text-muted hover:border-accent hover:text-accent"
        >
          <span className="font-mono text-accent">{i + 1}</span>
          <span className="truncate">{host(s.url)}</span>
        </button>
      ))}
    </div>
  );
}

function MsgTools({ text, last }: { text: string; last: boolean }) {
  const regenerate = useConversationStore((s) => s.regenerate);
  const busy = useConversationStore((s) => s.activeResponseId !== null);
  const btn = 'p-0.5 text-text-muted transition-colors hover:text-accent disabled:opacity-40';
  return (
    <span className="flex shrink-0 flex-col items-center gap-1 self-start opacity-0 transition-opacity focus-within:opacity-100 group-hover/msg:opacity-100">
      <CopyButton text={text} />
      <button
        type="button"
        aria-label="Read aloud"
        title="Read aloud"
        onClick={() => speakNow(text)}
        className={btn}
      >
        <Volume2 size={13} strokeWidth={1.5} />
      </button>
      {last && (
        <button
          type="button"
          aria-label="Regenerate answer"
          title="Try again (new answer)"
          disabled={busy}
          onClick={() => void regenerate()}
          className={btn}
        >
          <RotateCcw size={13} strokeWidth={1.5} />
        </button>
      )}
    </span>
  );
}

function Row({
  m,
  assistantName,
  lastUser = false,
  lastAssistant = false,
}: {
  m: Message;
  assistantName: string;
  lastUser?: boolean;
  lastAssistant?: boolean;
}) {
  const markRevealed = useConversationStore((s) => s.markRevealed);
  const onDone = useCallback(() => markRevealed(m.id), [markRevealed, m.id]);

  switch (m.role) {
    case 'user':
      return (
        <li className="group/user ml-10 text-right text-text-primary/70">
          {m.attachments && m.attachments.length > 0 && (
            <span className="mb-1 flex flex-wrap justify-end gap-1.5">
              {m.attachments.map((a, i) =>
                a.thumb ? (
                  <img
                    key={i}
                    src={a.thumb}
                    alt={a.name}
                    title={a.name}
                    className="h-16 max-w-[8rem] border border-line/70 object-cover"
                  />
                ) : (
                  <span
                    key={i}
                    className="flex items-center gap-1 border border-line/70 bg-panel-raised/60 px-2 py-1 text-[11px]"
                  >
                    <FileText size={12} className="text-accent" /> {a.name}
                  </span>
                ),
              )}
            </span>
          )}
          <span className="select-text">{m.text}</span>
          {lastUser && (
            <button
              type="button"
              aria-label="Edit your message"
              title="Edit and resend"
              onClick={() => {
                const text = useConversationStore.getState().editLast();
                if (text) window.dispatchEvent(new CustomEvent(PREFILL_EVENT, { detail: text }));
              }}
              className="ml-2 align-middle text-text-muted opacity-0 transition-opacity hover:text-accent focus:opacity-100 group-hover/user:opacity-100"
            >
              <Pencil size={12} strokeWidth={1.5} />
            </button>
          )}
          <span className="ml-2 font-mono text-[11px] text-text-muted">‹ you</span>
        </li>
      );
    case 'assistant':
      return (
        <li className="group/msg mr-6 flex gap-2 text-text-primary">
          <span className="shrink-0 font-mono text-accent">{assistantName} ›</span>
          <div className="min-w-0 flex-1 select-text">
            <Typewriter
              id={m.id}
              text={m.text}
              streaming={m.streaming}
              revealed={m.revealed}
              onDone={onDone}
              render={renderMd}
            />
            {m.previews && m.previews.length > 0 && <LinkCards previews={m.previews} />}
            {(() => {
              const shown = new Set((m.previews ?? []).map((p) => p.url));
              const rest = (m.sources ?? []).filter((s) => !shown.has(s.url));
              return rest.length > 0 ? <Sources sources={rest} /> : null;
            })()}
          </div>
          {!m.streaming && m.text && <MsgTools text={m.text} last={lastAssistant} />}
        </li>
      );
    case 'command':
      return (
        <li>
          <CommandCard id={m.id} command={m.command} timestamp={m.timestamp} />
        </li>
      );
    case 'system':
      if (m.map)
        return (
          <li>
            <JourneyMapCard map={m.map} />
          </li>
        );
      return (
        <li
          className={`font-mono text-[12px] ${m.tone === 'error' ? 'text-alert' : 'text-text-muted'}`}
        >
          <span className="mr-2">{m.tone === 'error' ? '!' : '·'}</span>
          <span className="select-text whitespace-pre-wrap">{m.text}</span>
        </li>
      );
  }
}

/** Scrolling message list. Auto-follows new content unless the user has scrolled up,
 *  in which case a "new messages" pill appears instead. */
export function Transcript({
  assistantName,
  large = false,
}: {
  assistantName: string;
  /** The Chat tab: bigger text and more room between messages. */
  large?: boolean;
}) {
  const messages = useConversationStore((s) => s.messages);
  const activity = useConversationStore((s) => s.activity);
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const stick = useRef(true);
  const [unseen, setUnseen] = useState(false);

  const toBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    stick.current = true;
    setUnseen(false);
  }, []);

  // Content grows both from new messages and from the typewriter, so watch size.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const ro = new ResizeObserver(() => {
      if (stick.current) toBottom();
      else setUnseen(true);
    });
    ro.observe(list);
    return () => ro.disconnect();
  }, [toBottom]);

  useEffect(() => {
    if (stick.current) toBottom();
  }, [messages.length, toBottom]);

  const onScroll = (): void => {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
    if (stick.current) setUnseen(false);
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto pr-1"
        tabIndex={0}
        aria-label="Conversation history"
      >
        <ol
          ref={listRef}
          className={
            large
              ? 'space-y-4 text-[14px] leading-relaxed'
              : 'space-y-1.5 text-[13px] leading-relaxed'
          }
          aria-label="Conversation"
          aria-live="polite"
        >
          {(() => {
            const lastUser = [...messages].reverse().find((x) => x.role === 'user')?.id;
            const lastAssistant = [...messages].reverse().find((x) => x.role === 'assistant')?.id;
            return messages.map((m) => (
              <Row
                key={m.id}
                m={m}
                assistantName={assistantName}
                lastUser={m.id === lastUser}
                lastAssistant={m.id === lastAssistant}
              />
            ));
          })()}
          {activity && (
            <li className="flex items-center gap-2 font-mono text-[12px] text-accent" role="status">
              <LoaderCircle size={12} className="animate-spin" /> {activity}
            </li>
          )}
        </ol>
      </div>
      {unseen && (
        <button
          type="button"
          onClick={() => toBottom(true)}
          className="absolute bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-1 border border-accent bg-void/95 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-accent shadow-glow-sm"
        >
          <ArrowDown size={11} strokeWidth={1.75} /> New messages
        </button>
      )}
    </div>
  );
}
