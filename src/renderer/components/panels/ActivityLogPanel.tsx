import { fmtClock } from '@renderer/lib/format';
import { useAssistantStore, type ActivityEntry } from '@renderer/stores/assistantStore';
import { Chip, Dot, type Tone } from './Chip';
import { Panel } from './Panel';

const STATUS_TONE: Record<ActivityEntry['status'], Tone> = {
  success: 'ok',
  failed: 'amber',
  pending: 'accent',
};

export function ActivityLogPanel({ className = '' }: { className?: string }) {
  const activity = useAssistantStore((s) => s.activity);
  return (
    <Panel
      code="LOG.06"
      title="Activity log"
      chip={<Chip tone="accent">Live</Chip>}
      className={className}
      bodyClassName="!py-1 overflow-y-auto"
    >
      {activity.length === 0 && (
        <p className="py-2 text-[13px] text-text-muted">
          Nothing yet. Apps I open, searches and other actions show up here.
        </p>
      )}
      <ul>
        {activity.map((a) => (
          <li
            key={a.id}
            className="hud-row grid grid-cols-[auto_auto_1fr] items-baseline gap-x-3 border-b border-line/30 py-2 last:border-0"
          >
            <span className="numeric text-[11px] text-text-muted">
              {fmtClock(new Date(a.timestamp), false)}
            </span>
            <span
              className={`font-mono text-[10px] uppercase tracking-[0.1em] ${a.status === 'failed' ? 'text-amber' : 'text-accent'}`}
            >
              {a.kind}
            </span>
            <span className="flex min-w-0 items-baseline gap-2 text-[13px] leading-snug text-text-primary">
              <span className="min-w-0 flex-1">{a.label}</span>
              <Dot tone={STATUS_TONE[a.status]} />
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
