import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from '@renderer/hooks/useReducedMotion';

const MS_PER_CHAR = 20;
const TICK_MS = 40; // 2 chars per tick ≈ 20ms/char, at 25 renders/s

/** Survives remounts (e.g. switching tabs mid-reply) so text doesn't retype. */
const progress = new Map<string, number>();

interface Props {
  id: string;
  text: string;
  streaming: boolean;
  revealed: boolean;
  onDone(): void;
  /** How to draw the visible part (e.g. as Markdown). Plain text by default. */
  render?(visible: string): ReactNode;
}

/** Reveals streamed text at ~20ms/char. Click to skip. Instant under reduced motion. */
export function Typewriter({ id, text, streaming, revealed, onDone, render }: Props) {
  const reduced = useReducedMotion();
  const instant = revealed || reduced;
  const [shown, setShown] = useState(() => (instant ? text.length : (progress.get(id) ?? 0)));
  const [skipped, setSkipped] = useState(false);
  const doneRef = useRef(revealed);
  const target = text.length;
  const visible = instant || skipped ? target : Math.min(shown, target);

  useEffect(() => {
    if (instant || skipped || shown >= target) return;
    const t = setInterval(() => {
      setShown((n) => {
        // Speed up if the stream gets far ahead, so long replies don't lag behind.
        const step = Math.max(TICK_MS / MS_PER_CHAR, Math.ceil((target - n) / 80));
        const next = Math.min(target, n + step);
        progress.set(id, next);
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(t);
  }, [instant, skipped, shown, target, id]);

  useEffect(() => {
    if (!doneRef.current && !streaming && visible >= target) {
      doneRef.current = true;
      progress.delete(id);
      onDone();
    }
  }, [streaming, visible, target, id, onDone]);

  const typing = visible < target || streaming;
  // Markdown is block content, so it needs a block wrapper.
  const Wrap = render ? 'div' : 'span';
  return (
    <Wrap
      onClick={() => typing && setSkipped(true)}
      className={typing ? 'cursor-pointer' : undefined}
      title={typing ? 'Click to skip' : undefined}
    >
      {render ? render(text.slice(0, visible)) : text.slice(0, visible)}
      {typing && (
        <span
          className="ml-0.5 inline-block h-[1em] w-[0.5em] translate-y-[2px] animate-blink bg-accent/80"
          aria-hidden
        />
      )}
    </Wrap>
  );
}
