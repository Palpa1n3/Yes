import { Bug, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { AssistantState } from '@shared/types';
import { useAssistantStore } from '@renderer/stores/assistantStore';

const STATES: Array<{ s: AssistantState; key: string; detail?: string }> = [
  { s: 'idle', key: '1' },
  { s: 'listening', key: '2' },
  { s: 'thinking', key: '3' },
  { s: 'speaking', key: '4' },
  { s: 'executing', key: '5', detail: 'Launching · Visual Studio Code' },
  { s: 'error', key: '6' },
];

/** Development-only: force the assistant state to review the core's motion.
 *  Rendered only when import.meta.env.DEV (see App.tsx). Alt+1…6 also works. */
export function DevStateSwitcher() {
  const { state, setState } = useAssistantStore();
  const [open, setOpen] = useState(false);

  return (
    <div
      className="no-drag fixed bottom-9 left-6 z-50 border border-amber/50 bg-void/95 font-mono text-[10px] uppercase tracking-[0.12em]"
      data-testid="dev-state-switcher"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-amber"
        aria-expanded={open}
      >
        <Bug size={12} strokeWidth={1.5} /> Dev · core state
        <ChevronDown
          size={12}
          strokeWidth={1.5}
          className={`ml-auto transition-transform ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open && (
        <div
          className="grid grid-cols-3 gap-1 p-1.5 pt-0"
          role="radiogroup"
          aria-label="Assistant state"
        >
          {STATES.map(({ s, key, detail }) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={state === s}
              title={`Alt+${key}`}
              onClick={() => setState(s, detail)}
              className={`border px-2 py-1 transition-colors ${state === s ? 'border-accent bg-accent/10 text-accent' : 'border-line text-text-muted hover:border-accent hover:text-accent'}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Alt+1…6 → state, for quick A/B while watching the core. */
export function bindDevStateKeys(): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (!e.altKey) return;
    const entry = STATES.find((x) => x.key === e.key);
    if (!entry) return;
    e.preventDefault();
    useAssistantStore.getState().setState(entry.s, entry.detail);
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
