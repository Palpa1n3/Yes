import { AlarmClock, BellOff, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useClock } from '@renderer/hooks/useClock';
import { fmtRemaining, timerTitle, useTimersStore } from '@renderer/stores/timersStore';
import { Chip } from './Chip';
import { Panel } from './Panel';
import { SegmentBar } from './SegmentBar';

const QUICK = [5, 10, 25];

/** Live countdowns with +5 / cancel, ringing rows with Dismiss / Snooze, and quick-start. */
export function TimersPanel({ className = '' }: { className?: string }) {
  const { timers, add, cancel, snooze } = useTimersStore();
  const now = useClock(1000).getTime();
  const [custom, setCustom] = useState(false);
  const [mins, setMins] = useState('15');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const ringing = timers.filter((t) => t.status === 'ringing').length;
  const running = timers.length - ringing;

  const start = (m: number, l = ''): void => {
    setError('');
    add(m, l).catch((e: unknown) =>
      setError(
        e instanceof Error
          ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
          : 'Could not start the timer.',
      ),
    );
  };

  return (
    <Panel
      code="TMR.01"
      title="Timers"
      chip={
        ringing ? (
          <Chip tone="alert">Time's up</Chip>
        ) : running ? (
          <Chip tone="accent">{running} running</Chip>
        ) : (
          <Chip tone="muted">Idle</Chip>
        )
      }
      className={className}
      bodyClassName="flex flex-col gap-2 !py-2"
    >
      {timers.length === 0 && (
        <p className="text-[12px] text-text-muted">
          No timers. Start one below, or say “remind me in 20 minutes to check the oven”.
        </p>
      )}
      <ul className="max-h-[132px] space-y-1.5 overflow-y-auto pr-1" aria-label="Timers">
        {timers.map((t) => {
          const left = t.dueAt - now;
          const pct =
            t.status === 'ringing'
              ? 100
              : Math.min(100, Math.max(0, (1 - left / t.durationMs) * 100));
          const isRinging = t.status === 'ringing';
          return (
            <li
              key={t.id}
              className={`border px-2 py-1.5 ${isRinging ? 'animate-pulse border-amber/80 bg-amber/10' : 'border-line/50'}`}
            >
              <div className="flex items-center gap-2">
                <AlarmClock
                  size={13}
                  strokeWidth={1.5}
                  className={isRinging ? 'text-amber' : 'text-accent'}
                  aria-hidden
                />
                <span
                  className="min-w-0 flex-1 truncate text-[12px] text-text-primary"
                  title={timerTitle(t)}
                >
                  {timerTitle(t)}
                </span>
                <span
                  className={`numeric text-[15px] ${isRinging ? 'text-amber' : 'text-ice'}`}
                  aria-label={isRinging ? "Time's up" : `${fmtRemaining(left)} left`}
                >
                  {isRinging ? 'DONE' : fmtRemaining(left)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="flex-1">
                  <SegmentBar
                    value={pct}
                    segments={24}
                    height={3}
                    tone={isRinging ? 'amber' : 'accent'}
                    label={`${timerTitle(t)} progress`}
                  />
                </div>
                {isRinging ? (
                  <>
                    <button
                      type="button"
                      className="hud-button !px-1.5 !py-0"
                      onClick={() => snooze(t.id, 5)}
                    >
                      Snooze 5
                    </button>
                    <button
                      type="button"
                      className="hud-button !border-amber/70 !px-1.5 !py-0 !text-amber"
                      onClick={() => cancel(t.id)}
                    >
                      <BellOff size={11} strokeWidth={1.5} /> Dismiss
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="hud-button !px-1.5 !py-0"
                      onClick={() => snooze(t.id, 5)}
                      aria-label={`Add 5 minutes to ${timerTitle(t)}`}
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      className="text-text-muted transition-colors hover:text-alert"
                      onClick={() => cancel(t.id)}
                      aria-label={`Cancel ${timerTitle(t)}`}
                    >
                      <X size={13} strokeWidth={1.5} />
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {custom ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const m = Number(mins);
            if (m > 0) start(m, label);
            setLabel('');
            setCustom(false);
          }}
        >
          <input
            value={mins}
            onChange={(e) => setMins(e.target.value.replace(/[^\d.]/g, ''))}
            aria-label="Minutes"
            inputMode="decimal"
            className="h-7 w-12 border border-line bg-panel-raised/80 px-1.5 text-center font-mono text-[12px] focus:border-accent focus:outline-none"
          />
          <span className="micro-label">min</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            aria-label="Timer label"
            maxLength={120}
            className="h-7 min-w-0 flex-1 border border-line bg-panel-raised/80 px-1.5 text-[12px] focus:border-accent focus:outline-none"
          />
          <button type="submit" className="hud-button !py-0.5">
            Start
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="micro-label mr-1">Quick</span>
          {QUICK.map((m) => (
            <button
              key={m}
              type="button"
              className="hud-button !px-2 !py-0.5"
              onClick={() => start(m)}
            >
              {m}m
            </button>
          ))}
          <button
            type="button"
            className="hud-button !px-2 !py-0.5"
            onClick={() => setCustom(true)}
          >
            <Plus size={11} strokeWidth={1.75} /> Custom
          </button>
        </div>
      )}
      {error && <p className="text-[11px] text-alert">{error}</p>}
    </Panel>
  );
}
