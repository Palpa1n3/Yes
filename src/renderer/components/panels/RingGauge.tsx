import { useTween } from '@renderer/hooks/useTween';
import type { Tone } from './Chip';

const STROKE: Record<Tone, string> = {
  accent: 'rgb(var(--accent))',
  amber: 'rgb(var(--amber))',
  alert: 'rgb(var(--alert))',
  ok: 'rgb(var(--ok))',
  muted: 'rgb(var(--text-muted))',
};

/** Thin segmented arc gauge (270° sweep) with a centred readout. */
export function RingGauge({
  value,
  size = 120,
  tone = 'accent',
  label,
  sub,
}: {
  value: number;
  size?: number;
  tone?: Tone;
  label: string;
  sub?: string;
}) {
  const v = useTween(value);
  const r = 44;
  const c = 2 * Math.PI * r;
  const sweep = 0.75;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-[225deg]" aria-hidden>
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="rgb(var(--line))"
          strokeWidth="5"
          strokeDasharray={`${c * sweep} ${c}`}
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={STROKE[tone]}
          strokeWidth="5"
          strokeDasharray={`${(c * sweep * Math.min(100, v)) / 100} ${c}`}
        />
        {/* segment gaps */}
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="rgb(var(--bg-panel))"
          strokeWidth="6"
          strokeDasharray={`0.8 ${(c * sweep) / 24 - 0.8}`}
        />
        <circle
          cx="50"
          cy="50"
          r="36"
          fill="none"
          stroke="rgb(var(--line))"
          strokeWidth="0.6"
          strokeDasharray="1 2"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="numeric text-[22px] font-light leading-none text-ice">
          {Math.round(v)}
          <span className="text-[12px] text-text-muted">%</span>
        </span>
        <span className="panel-title mt-1 text-text-primary">{label}</span>
        {sub && <span className="numeric mt-0.5 text-[10px] text-text-muted">{sub}</span>}
      </div>
    </div>
  );
}
