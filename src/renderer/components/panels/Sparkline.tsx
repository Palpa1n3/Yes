import { useId } from 'react';

interface Props {
  data: number[];
  max?: number;
  min?: number;
  height?: number;
  /** Second series drawn dimmer (e.g. upload under download). */
  secondary?: number[];
  grid?: boolean;
  /** Fix the x-axis length so the line scrolls in from the right as history fills. */
  capacity?: number;
  className?: string;
}

function toPoints(data: number[], lo: number, hi: number, h: number, cap: number): string {
  const span = hi - lo || 1;
  const offset = cap - data.length;
  return data
    .map((v, i) => {
      const x = ((offset + i) / (cap - 1)) * 100;
      const y = h - ((v - lo) / span) * (h - 2) - 1;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

/** Responsive SVG line chart; stroke width stays crisp at any size. */
export function Sparkline({
  data,
  max,
  min = 0,
  height = 48,
  secondary,
  grid = false,
  capacity = 60,
  className = '',
}: Props) {
  const id = useId();
  const hi = max ?? Math.max(1, ...data, ...(secondary ?? []));
  const cap = Math.max(capacity, data.length, 2);
  const pts = toPoints(data, min, hi, height, cap);
  const first = pts.split(' ')[0]?.split(',')[0] ?? '100';

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className={`block w-full ${className}`}
      style={{ height }}
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.28" />
          <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0" />
        </linearGradient>
      </defs>
      {grid &&
        [0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1="0"
            x2="100"
            y1={height * f}
            y2={height * f}
            stroke="rgb(var(--line))"
            strokeWidth="1"
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      {data.length > 1 && (
        <>
          <polygon points={`${first},${height} ${pts} 100,${height}`} fill={`url(#${id})`} />
          <polyline
            points={pts}
            fill="none"
            stroke="rgb(var(--accent))"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        </>
      )}
      {secondary && secondary.length > 1 && (
        <polyline
          points={toPoints(secondary, min, hi, height, cap)}
          fill="none"
          stroke="rgb(var(--ice))"
          strokeOpacity="0.45"
          strokeWidth="1"
          strokeDasharray="3 2"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
