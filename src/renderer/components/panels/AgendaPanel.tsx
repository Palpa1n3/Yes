import { CalendarDays, MapPin, RefreshCw } from 'lucide-react';
import { dayLabel, eventsOn, fmtTime, nextEvent, type CalEvent } from '@shared/calendar';
import { useClock } from '@renderer/hooks/useClock';
import { useCalendarStore } from '@renderer/stores/calendarStore';
import { useUiStore } from '@renderer/stores/uiStore';
import { Chip } from './Chip';
import { Panel } from './Panel';

/** "in 25 min", "in 2h 05m", "in 3 days". */
export function untilText(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `in ${m} min`;
  if (m < 24 * 60) return `in ${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  const d = Math.round(m / (24 * 60));
  return `in ${d} day${d === 1 ? '' : 's'}`;
}

function Row({ e, now, next }: { e: CalEvent; now: number; next: boolean }) {
  const past = e.end <= now;
  const live = !e.allDay && e.start <= now && e.end > now;
  return (
    <li
      className={`hud-row grid grid-cols-[3.4rem_1fr] items-start gap-2 border-l-2 py-1 pl-2 text-[12px] ${
        live || next ? 'border-accent bg-accent/[0.07] text-ice' : 'border-transparent'
      } ${past ? 'opacity-45' : ''}`}
      title={[e.title, e.location].filter(Boolean).join(' · ')}
    >
      <span className="numeric pt-px text-[11px] text-text-muted">
        {e.allDay ? 'All day' : fmtTime(e.start)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-text-primary">{e.title}</span>
        {e.location && (
          <span className="flex items-center gap-1 truncate text-[10px] text-text-muted">
            <MapPin size={9} className="shrink-0" />
            {e.location}
          </span>
        )}
      </span>
    </li>
  );
}

/** Today's events (and tomorrow's), from the connected calendar. */
export function AgendaPanel({ className = '' }: { className?: string }) {
  const { configured, events, error, loading, refresh } = useCalendarStore();
  const now = useClock(30_000).getTime();

  if (!configured) {
    return (
      <Panel
        code="CAL.05"
        title="Agenda"
        chip={<Chip tone="muted">Not set</Chip>}
        className={className}
        bodyClassName="!py-2"
      >
        <p className="text-[12px] text-text-muted">
          See your Google Calendar here and in the morning briefing.
        </p>
        <button
          type="button"
          className="hud-button mt-2"
          onClick={() => useUiStore.getState().openSettings('general')}
        >
          <CalendarDays size={12} strokeWidth={1.5} /> Connect calendar
        </button>
      </Panel>
    );
  }

  const today = eventsOn(events, now);
  const tomorrowAt = new Date(now);
  tomorrowAt.setDate(tomorrowAt.getDate() + 1);
  const tomorrow = eventsOn(events, tomorrowAt.getTime()).filter((e) => !today.includes(e));
  const next = nextEvent(events, now);
  const upcoming =
    !today.length && !tomorrow.length ? events.find((e) => e.start > now) : undefined;

  return (
    <Panel
      code="CAL.05"
      title="Agenda"
      chip={
        <span className="flex shrink-0 items-center gap-1.5">
          {error ? (
            <Chip tone="amber">Offline</Chip>
          ) : next && next.start > now ? (
            <span
              className="inline-flex h-5 items-center whitespace-nowrap border border-accent/60 bg-accent/5 px-1.5 font-mono text-[10px] tracking-[0.08em] text-accent"
              title={`${next.title} ${untilText(next.start - now)}`}
            >
              {untilText(next.start - now).replace(/^in /, '')}
            </span>
          ) : (
            <Chip tone="muted">{today.length} today</Chip>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            aria-label="Refresh calendar"
            title={error ?? 'Refresh'}
            className="no-drag text-text-muted hover:text-accent"
          >
            <RefreshCw size={12} strokeWidth={1.5} className={loading ? 'animate-spin' : ''} />
          </button>
        </span>
      }
      className={className}
      bodyClassName="flex min-h-0 flex-col gap-1 overflow-y-auto !py-2"
    >
      <div className="micro-label">Today</div>
      {today.length ? (
        <ul aria-label="Today's events">
          {today.map((e) => (
            <Row key={e.id} e={e} now={now} next={e === next && e.start > now} />
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-text-muted">Nothing on. Enjoy it.</p>
      )}
      {tomorrow.length > 0 && (
        <>
          <div className="micro-label mt-1">Tomorrow</div>
          <ul aria-label="Tomorrow's events">
            {tomorrow.slice(0, 4).map((e) => (
              <Row key={e.id} e={e} now={now} next={false} />
            ))}
          </ul>
        </>
      )}
      {upcoming && (
        <p className="mt-1 text-[11px] text-text-muted">
          Next: {upcoming.title}, {dayLabel(upcoming.start, now).toLowerCase()}
          {upcoming.allDay ? '' : ` at ${fmtTime(upcoming.start)}`}
        </p>
      )}
    </Panel>
  );
}
