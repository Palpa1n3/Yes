import { AnimatePresence, motion } from 'framer-motion';
import { AlarmClock, BellOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { timerTitle, useTimersStore } from '@renderer/stores/timersStore';

/** "Time's up" banner over every tab, with Dismiss (focused, so Enter works) and Snooze. */
export function RingingBanner({ compact = false }: { compact?: boolean }) {
  const { timers, cancel, snooze } = useTimersStore();
  const ringing = timers.filter((t) => t.status === 'ringing').slice(0, 3);
  const dismissRef = useRef<HTMLButtonElement>(null);
  const first = ringing[0]?.id;

  useEffect(() => {
    if (first) dismissRef.current?.focus();
  }, [first]);

  return (
    <AnimatePresence>
      {ringing.length > 0 && (
        <motion.div
          role="alertdialog"
          aria-label="Timer finished"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className={
            compact
              ? 'no-drag absolute inset-x-2 top-2 z-50 border border-amber bg-void/95 px-2 py-1.5 shadow-[0_0_18px_rgb(var(--amber)/0.35)]'
              : 'no-drag absolute left-1/2 top-16 z-50 w-[min(520px,90%)] -translate-x-1/2 border border-amber bg-void/95 px-4 py-3 shadow-[0_0_24px_rgb(var(--amber)/0.35)]'
          }
        >
          {ringing.map((t, i) => (
            <div
              key={t.id}
              className={`flex items-center gap-3 ${i > 0 ? 'mt-2 border-t border-amber/30 pt-2' : ''}`}
            >
              <AlarmClock
                size={compact ? 16 : 22}
                strokeWidth={1.5}
                className="shrink-0 animate-pulse text-amber"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                {!compact && (
                  <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-amber">
                    Time's up
                  </div>
                )}
                <div
                  className={`truncate text-text-primary ${compact ? 'text-[12px]' : 'text-[15px]'}`}
                >
                  {timerTitle(t)}
                </div>
              </div>
              <button type="button" className="hud-button" onClick={() => snooze(t.id, 5)}>
                Snooze 5
              </button>
              <button
                ref={i === 0 ? dismissRef : undefined}
                type="button"
                className="hud-button !border-amber !text-amber"
                onClick={() => cancel(t.id)}
              >
                <BellOff size={12} strokeWidth={1.5} /> Dismiss
              </button>
            </div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
