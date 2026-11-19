import { AlarmClock, Target } from 'lucide-react';
import { useClock } from '@renderer/hooks/useClock';
import { fmtRemaining, timerTitle, useTimersStore } from '@renderer/stores/timersStore';
import { useUiStore } from '@renderer/stores/uiStore';

/** Next timer's countdown beside the clock, visible from every tab. Hidden when idle. */
export function TimerChip() {
  const timers = useTimersStore((s) => s.timers);
  const now = useClock(1000).getTime();
  const ringing = timers.find((t) => t.status === 'ringing');
  const next = timers.filter((t) => t.status === 'running').sort((a, b) => a.dueAt - b.dueAt)[0];
  const t = ringing ?? next;
  if (!t) return null;
  return (
    <button
      type="button"
      onClick={() => useUiStore.getState().setTab('overview')}
      title={`${timerTitle(t)}${timers.length > 1 ? ` (+${timers.length - 1} more)` : ''}`}
      className={`no-drag flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap border px-2 font-mono text-[12px] tabular-nums transition-colors ${
        ringing
          ? 'animate-pulse border-amber bg-amber/15 text-amber'
          : 'border-line/70 text-ice hover:border-accent'
      }`}
      aria-label={
        ringing
          ? `Timer done: ${timerTitle(t)}`
          : `Next timer: ${timerTitle(t)}, ${fmtRemaining(t.dueAt - now)} left`
      }
    >
      {t.kind === 'focus' ? (
        <Target size={13} strokeWidth={1.5} className="text-accent" />
      ) : (
        <AlarmClock size={13} strokeWidth={1.5} />
      )}
      {ringing
        ? t.kind === 'focus'
          ? 'FOCUS DONE'
          : "TIME'S UP"
        : `${t.kind === 'focus' ? 'FOCUS ' : ''}${fmtRemaining(t.dueAt - now)}`}
    </button>
  );
}
