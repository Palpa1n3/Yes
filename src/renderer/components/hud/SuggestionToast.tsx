import { Lightbulb, X } from 'lucide-react';
import { useEffect } from 'react';
import { create } from 'zustand';
import type { Suggestion } from '@shared/initiative';
import { useConversationStore } from '@renderer/stores/conversationStore';

export const useSuggestionStore = create<{ current: Suggestion | null }>(() => ({ current: null }));

/** Alton speaks up (Settings › General › Offer help unprompted). */
export function bindSuggestions(): () => void {
  return window.arc.initiative.onSuggest((s) => {
    useSuggestionStore.setState({ current: s });
    useConversationStore.getState().pushAssistant(s.text);
  });
}

export function SuggestionToast() {
  const s = useSuggestionStore((x) => x.current);
  // Suggestions fade away after two minutes.
  useEffect(() => {
    if (!s) return;
    const t = setTimeout(() => useSuggestionStore.setState({ current: null }), 120_000);
    return () => clearTimeout(t);
  }, [s]);
  if (!s) return null;
  const close = (): void => useSuggestionStore.setState({ current: null });
  return (
    <aside
      aria-label="Suggestion"
      className="fixed top-20 left-1/2 z-40 flex w-[460px] max-w-[90vw] -translate-x-1/2 items-start gap-2 border border-accent/60 bg-panel/95 p-3 shadow-glow-sm backdrop-blur"
    >
      <Lightbulb size={14} className="mt-0.5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] text-text-primary">{s.text}</p>
        <div className="mt-2 flex gap-2">
          {s.action && (
            <button
              type="button"
              className="hud-button"
              onClick={() => {
                const a = s.action;
                close();
                if (a) void useConversationStore.getState().perform(a.intent);
              }}
            >
              {s.action.label}
            </button>
          )}
          {s.ask && (
            <button
              type="button"
              className="hud-button"
              onClick={() => {
                const a = s.ask;
                close();
                if (a) void useConversationStore.getState().send(a.text);
              }}
            >
              {s.ask.label}
            </button>
          )}
          <button type="button" className="hud-button" onClick={close}>
            Not now
          </button>
        </div>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={close}
        className="text-text-muted hover:text-accent"
      >
        <X size={13} />
      </button>
    </aside>
  );
}
