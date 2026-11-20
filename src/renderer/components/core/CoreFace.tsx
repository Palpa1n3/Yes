import { memo, useEffect, useRef } from 'react';
import type { AssistantState } from '@shared/types';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { runFace } from './face';
import type { LiveAvatar } from './avatarKit';

interface Props {
  size: { w: number; h: number };
  center: { x: number; y: number };
  radius: number;
  state: AssistantState;
  reducedMotion: boolean;
  getLevel: () => number;
  themeKey: string;
}

export const CoreFace = memo(function CoreFace({
  size,
  center,
  radius,
  state,
  reducedMotion,
  getLevel,
  themeKey,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const lastReply = (): { text: string; at: number } | null => {
    const m = [...useConversationStore.getState().messages]
      .reverse()
      .find((x) => x.role === 'assistant');
    return m ? { text: m.text, at: m.timestamp } : null;
  };
  const live = useRef<LiveAvatar>({ state, reducedMotion, getLevel, center, radius, lastReply });
  live.current = { state, reducedMotion, getLevel, center, radius, lastReply };
  // With reduced motion a still frame is drawn per state; otherwise the loop reads state live.
  const stillKey = reducedMotion ? state : null;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    return runFace(canvas, { w: size.w, h: size.h }, live);
  }, [size.w, size.h, themeKey, reducedMotion, stillKey]);

  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute inset-0"
      style={{ width: size.w, height: size.h }}
      aria-hidden
    />
  );
});
