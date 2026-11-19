import type { JourneyMap } from '@shared/types';

/** A small glowing route map for "how long to get to…": the route on a dark grid, home and
 *  destination marked, with the time to allow. No map tiles (nothing else is downloaded). */
export function JourneyMapCard({ map }: { map: JourneyMap }) {
  const W = 420;
  const H = 210;
  const pad = 26;
  const pts = map.path.length >= 2 ? map.path : [];
  // Fit the route in the box, keeping its shape (longitude squeezed by latitude).
  const lat0 = pts.reduce((n, p) => n + p[1], 0) / Math.max(1, pts.length);
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const xs = pts.map((p) => p[0] * kx);
  const ys = pts.map((p) => -p[1]);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const scale = Math.min(
    (W - pad * 2) / Math.max(1e-6, maxX - minX),
    (H - pad * 2) / Math.max(1e-6, maxY - minY),
  );
  const ox = (W - (maxX - minX) * scale) / 2;
  const oy = (H - (maxY - minY) * scale) / 2;
  const xy = pts.map((_, i) => [
    ox + ((xs[i] ?? 0) - minX) * scale,
    oy + ((ys[i] ?? 0) - minY) * scale,
  ]);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x?.toFixed(1)},${y?.toFixed(1)}`).join(' ');
  const a = xy[0];
  const b = xy[xy.length - 1];
  const how = map.mode === 'walking' ? 'walk' : map.mode === 'cycling' ? 'cycle' : 'drive';
  return (
    <figure className="my-1 max-w-[440px] overflow-hidden rounded-[10px] border border-accent/40 bg-void/80 shadow-glow-sm">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Route from ${map.from} to ${map.to}`}
      >
        {Array.from({ length: 9 }, (_, i) => (
          <line
            key={`v${i}`}
            x1={(i * W) / 8}
            y1={0}
            x2={(i * W) / 8}
            y2={H}
            style={{ stroke: 'rgb(var(--line) / 0.35)' }}
          />
        ))}
        {Array.from({ length: 5 }, (_, i) => (
          <line
            key={`h${i}`}
            x1={0}
            y1={(i * H) / 4}
            x2={W}
            y2={(i * H) / 4}
            style={{ stroke: 'rgb(var(--line) / 0.35)' }}
          />
        ))}
        {d && (
          <>
            <path
              d={d}
              fill="none"
              strokeWidth={9}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ stroke: 'rgb(var(--accent) / 0.18)' }}
            />
            <path
              d={d}
              fill="none"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ stroke: 'rgb(var(--accent))' }}
            />
          </>
        )}
        {a && <circle cx={a[0]} cy={a[1]} r={5} style={{ fill: 'rgb(var(--ice))' }} />}
        {b && (
          <>
            <circle cx={b[0]} cy={b[1]} r={11} style={{ fill: 'rgb(var(--accent) / 0.25)' }} />
            <circle cx={b[0]} cy={b[1]} r={5} style={{ fill: 'rgb(var(--accent))' }} />
          </>
        )}
      </svg>
      <figcaption className="flex items-baseline justify-between gap-3 border-t border-line/50 px-3 py-2 text-[12px]">
        <span className="min-w-0 truncate text-text-muted">
          {map.from.split(',')[0]} → <span className="text-ice">{map.to.split(',')[0]}</span>
        </span>
        <span className="shrink-0 font-mono text-ice">
          {map.minutes} min {how} · {map.km} km
          {map.mode === 'driving' && <span className="text-text-muted"> · allow {map.allow}</span>}
        </span>
      </figcaption>
    </figure>
  );
}
