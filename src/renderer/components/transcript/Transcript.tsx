import { ArrowDown, Check, Copy, LoaderCircle } from 'lucide-react';
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
      className="mt-0.5 h-5 shrink-0 self-start text-text-muted opacity-0 transition-opacity hover:text-accent focus:opacity-100 group-hover/msg:opacity-100"
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

function Row({ m, assistantName }: { m: Message; assistantName: string }) {
  const markRevealed = useConversationStore((s) => s.markRevealed);
  const onDone = useCallback(() => markRevealed(m.id), [markRevealed, m.id]);

  switch (m.role) {
    case 'user':
      return (
        <li className="ml-10 text-right text-text-primary/70">
          <span className="select-text">{m.text}</span>
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
            {m.sources && m.sources.length > 0 && <Sources sources={m.sources} />}
          </div>
          {!m.streaming && m.text && <CopyButton text={m.text} />}
        </li>
      );
    case 'command':
      return (
        <li>
          <CommandCard id={m.id} command={m.command} timestamp={m.timestamp} />
        </li>
      );
    case 'system':
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
          {messages.map((m) => (
            <Row key={m.id} m={m} assistantName={assistantName} />
          ))}
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
