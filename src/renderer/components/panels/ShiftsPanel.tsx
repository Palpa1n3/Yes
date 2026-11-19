import { useEffect, useState } from 'react';
import { describeShift, shiftHours, weekHours, type Shift } from '@shared/shifts';
import { useClock } from '@renderer/hooks/useClock';
import { untilText } from './AgendaPanel';
import { Chip } from './Chip';
import { Panel } from './Panel';

const at = (s: string): number => new Date(s).getTime();

/** Work shifts synced from the phone app: what's next, and hours this week.
 *  Hidden until a rota has been synced. */
export function ShiftsPanel({ className = '' }: { className?: string }) {
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const now = useClock(60_000).getTime();

  useEffect(() => {
    const load = (): void => void window.arc.notes.shifts().then(setShifts);
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, []);

  if (!shifts?.length) return null;
  const upcoming = shifts.filter((s) => at(s.end) > now);
  if (!upcoming.length) return null;
  const next = upcoming[0];
  const live = next && at(next.start) <= now;
  const hours = weekHours(shifts, new Date(now));

  return (
    <Panel
      code="WRK.07"
      title="Shifts"
      chip={<Chip tone="muted">{hours}h wk</Chip>}
      className={className}
      bodyClassName="!py-2"
    >
      {next && (
        <p className="mb-1.5 text-[12px] text-ice">
          {live ? 'At work now · ends ' : 'Next shift '}
          <span className="text-accent">
            {live ? next.end.slice(11, 16) : untilText(at(next.start) - now)}
          </span>
        </p>
      )}
      <ul className="space-y-0.5">
        {upcoming.slice(0, 5).map((s, i) => (
          <li
            key={`${s.start}/${s.end}`}
            className={`hud-row flex items-baseline gap-2 border-l-2 py-0.5 pl-2 text-[12px] ${
              i === 0 ? 'border-accent bg-accent/[0.07] text-ice' : 'border-transparent'
            }`}
            title={[s.title, s.location].filter(Boolean).join(' · ')}
          >
            <span className="numeric w-[9.5rem] shrink-0 text-[11px] text-text-muted">
              {describeShift(s).replace(/ \(.*\)$/, '')}
            </span>
            <span className="min-w-0 flex-1 truncate text-text-primary">{s.title}</span>
            <span className="numeric text-[10px] text-text-muted">{shiftHours(s)}h</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
