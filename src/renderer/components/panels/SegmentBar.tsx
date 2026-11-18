import type { Tone } from './Chip';

const FILL: Record<Tone, string> = {
  accent: 'bg-accent',
  amber: 'bg-amber',
  alert: 'bg-alert',
  ok: 'bg-ok',
  muted: 'bg-text-muted',
};

interface Props {
  value: number; // 0–100
  segments?: number;
  tone?: Tone;
  height?: number;
  label?: string;
}

/** Segmented HUD bar. Filled segments glow; the rest are faint slots. */
export function SegmentBar({ value, segments = 20, tone = 'accent', height = 6, label }: Props) {
  const lit = Math.round((Math.min(100, Math.max(0, value)) / 100) * segments);
  return (
    <div
      className="flex w-full gap-[2px]"
      style={{ height }}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className={`flex-1 transition-colors duration-500 ${i < lit ? `${FILL[tone]} opacity-90` : 'bg-line/50'}`}
        />
      ))}
    </div>
  );
}
