import { X } from 'lucide-react';
import { useState } from 'react';
import { hoursSvg, mondayOf, weekSvg, weeksSummary, type ChartColors } from '@shared/shiftChart';
import type { Shift } from '@shared/shifts';

const COLORS: ChartColors = {
  bar: 'rgb(var(--accent))',
  text: 'rgb(var(--ice))',
  muted: 'rgb(var(--text-muted))',
  grid: 'rgb(var(--line) / 0.6)',
  today: 'rgb(var(--accent) / 0.08)',
};

/** Your week at a glance: shifts as bars on a timeline, plus hours per week. */
export function WeekView({ shifts, onClose }: { shifts: Shift[]; onClose(): void }) {
  const [week, setWeek] = useState(0);
  const monday = mondayOf(new Date(), week);
  const rows = weeksSummary(shifts);
  const title =
    week === 0
      ? 'This week'
      : week === 1
        ? 'Next week'
        : `Week of ${monday.toLocaleDateString([], { day: 'numeric', month: 'short' })}`;
  return (
    <div
      className="no-drag fixed inset-0 z-[60] flex items-center justify-center bg-void/80 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-label="Shift week"
        className="hud-panel w-[min(640px,calc(100%-40px))] !rounded-[14px] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-center gap-2">
          <h2 className="flex-1 font-display text-[18px] font-light text-ice">{title}</h2>
          <button
            type="button"
            className="hud-button"
            disabled={week <= -1}
            onClick={() => setWeek((w) => w - 1)}
          >
            ‹ Prev
          </button>
          <button
            type="button"
            className="hud-button"
            disabled={week >= 3}
            onClick={() => setWeek((w) => w + 1)}
          >
            Next ›
          </button>
          <button
            type="button"
            aria-label="Close"
            className="ml-1 text-text-muted hover:text-accent"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        <div dangerouslySetInnerHTML={{ __html: weekSvg(shifts, monday, COLORS) }} />
        <h3 className="mb-1 mt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
          Hours per week
        </h3>
        <div dangerouslySetInnerHTML={{ __html: hoursSvg(rows, COLORS) }} />
        <p className="mt-2 text-[12px] text-text-muted">
          Hover a bar for details. Pay estimates are on the phone app (where your hourly rate is).
        </p>
      </section>
    </div>
  );
}
