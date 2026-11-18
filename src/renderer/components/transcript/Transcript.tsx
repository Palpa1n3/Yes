import { ArrowDown } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useConversationStore, type Message } from '@renderer/stores/conversationStore';
import { CommandCard } from './CommandCard';
import { Typewriter } from './Typewriter';

const STICK_PX = 24;

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
        <li className="mr-6 text-text-primary">
          <span className="mr-2 font-mono text-accent">{assistantName} ›</span>
          <span className="select-text">
            <Typewriter
              id={m.id}
              text={m.text}
              streaming={m.streaming}
              revealed={m.revealed}
              onDone={onDone}
            />
          </span>
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
export function Transcript({ assistantName }: { assistantName: string }) {
  const messages = useConversationStore((s) => s.messages);
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
          className="space-y-1.5 text-[13px] leading-relaxed"
          aria-label="Conversation"
          aria-live="polite"
        >
          {messages.map((m) => (
            <Row key={m.id} m={m} assistantName={assistantName} />
          ))}
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
