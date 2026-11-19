import { AnimatePresence, motion } from 'framer-motion';
import type { AssistantState } from '@shared/types';
import { useElementSize } from '@renderer/hooks/useElementSize';
import { useReducedMotion } from '@renderer/hooks/useReducedMotion';
import { useTween } from '@renderer/hooks/useTween';
import { CoreCanvas } from './CoreCanvas';
import { CoreFace } from './CoreFace';
import { CoreCode } from './CoreCode';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { polar } from './geometry';

export interface Connector {
  angle: number; // degrees, screen-space (0 = east, clockwise)
  label: string;
}

interface Props {
  state: AssistantState;
  /** Extra context for the state label, e.g. the command while executing. */
  stateDetail?: string;
  getLevel: () => number;
  themeKey: string;
  /** Idle readout. */
  label: string;
  value: number;
  unit: string;
  sub: string;
  ringText: string;
  connectors?: Connector[];
  /** Small core for the compact pill: fills the box, no readout text. */
  compact?: boolean;
}

const STATE_LABEL: Partial<Record<AssistantState, string>> = {
  listening: 'Listening',
  thinking: 'Processing',
  speaking: 'Speaking',
  executing: 'Executing',
  error: 'Fault',
};

const STATE_TEXT: Partial<Record<AssistantState, string>> = {
  executing: 'text-amber',
  error: 'text-alert',
};

/** The central core: canvas rings + HTML readout + SVG leader lines.
 *  Sizes itself to its container; driven only by props. */
export function CoreDisplay({
  state,
  stateDetail,
  getLevel,
  themeKey,
  label,
  value,
  unit,
  sub,
  ringText,
  connectors = [],
  compact = false,
}: Props) {
  const [ref, { w, h }] = useElementSize<HTMLDivElement>();
  const reduced = useReducedMotion();
  const v = useTween(value);
  const avatar = useSettingsStore((x) => x.settings.avatar);
  /** Face and code ring show a small state label instead of the rings' readout. */
  const face = avatar !== 'rings';

  const cx = w / 2;
  const cy = h / 2;
  // Leave room for leader lines on both sides.
  const R = compact
    ? Math.max(0, Math.min(w, h) / 2 - 2)
    : Math.max(0, Math.min(h / 2 - 8, w / 2 - 70));
  const detail = R >= 120;
  const stateLabel = STATE_LABEL[state];
  const tone = STATE_TEXT[state] ?? 'text-ice';
  const fs = (k: number, min: number): number => Math.max(min, R * k);

  return (
    <div
      ref={ref}
      className="relative h-full w-full"
      role="img"
      aria-label={`Assistant ${stateLabel ?? 'idle'}`}
    >
      {R > (compact ? 16 : 40) && (
        <>
          <svg width={w} height={h} className="absolute inset-0" aria-hidden>
            {connectors.map((c) => {
              const p0 = polar(R + 6, c.angle, cx, cy);
              const p1 = polar(R + 34, c.angle, cx, cy);
              const east = Math.cos((c.angle * Math.PI) / 180) > 0;
              const edge = east ? w - 2 : 2;
              return (
                <g key={c.label}>
                  <polyline
                    points={`${p0.x},${p0.y} ${p1.x},${p1.y} ${edge},${p1.y}`}
                    fill="none"
                    stroke="rgb(var(--accent))"
                    strokeOpacity="0.45"
                    strokeWidth="1"
                  />
                  <rect x={p1.x - 3} y={p1.y - 3} width="6" height="6" fill="rgb(var(--accent))" />
                  <text
                    x={edge}
                    y={p1.y - 7}
                    textAnchor={east ? 'end' : 'start'}
                    fill="rgb(var(--text-muted))"
                    fontFamily="JetBrains Mono, monospace"
                    fontSize="10"
                    letterSpacing="1.5"
                  >
                    {c.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {avatar === 'code' ? (
            <CoreCode
              size={{ w, h }}
              center={{ x: cx, y: cy }}
              radius={R}
              state={state}
              reducedMotion={reduced}
              getLevel={getLevel}
              themeKey={themeKey}
            />
          ) : face ? (
            <CoreFace
              size={{ w, h }}
              center={{ x: cx, y: cy }}
              radius={R}
              state={state}
              reducedMotion={reduced}
              getLevel={getLevel}
              themeKey={themeKey}
            />
          ) : (
            <CoreCanvas
              size={{ w, h }}
              center={{ x: cx, y: cy }}
              radius={R}
              state={state}
              ringText={ringText}
              reducedMotion={reduced}
              getLevel={getLevel}
              themeKey={themeKey}
            />
          )}

          {!compact && face && stateLabel && detail && (
            <div
              className="pointer-events-none absolute left-0 right-0 text-center"
              style={{ top: cy + R * (avatar === 'code' ? 0.27 : 0.76) }}
            >
              <span
                className={`font-display uppercase text-glow-md ${tone}`}
                style={{ fontSize: fs(0.05, 10), letterSpacing: '0.28em' }}
              >
                {stateLabel}
                {stateDetail ? ` · ${stateDetail.slice(0, 40)}` : ''}
              </span>
            </div>
          )}

          {!compact && !face && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <AnimatePresence mode="wait" initial={false}>
                {stateLabel ? (
                  <motion.div
                    key={state}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: reduced ? 0 : 0.18 }}
                    className="flex flex-col items-center"
                    style={{ maxWidth: R * 0.78 }}
                  >
                    <span
                      className={`font-display uppercase text-glow-md ${tone}`}
                      style={{ fontSize: fs(0.085, 11), letterSpacing: '0.28em' }}
                    >
                      {stateLabel}
                    </span>
                    {stateDetail && detail && (
                      <span
                        className="numeric mt-1.5 line-clamp-2 uppercase leading-snug text-text-primary/80"
                        style={{
                          fontSize: fs(0.045, 9),
                          letterSpacing: '0.12em',
                          maxWidth: '100%',
                        }}
                      >
                        {stateDetail}
                      </span>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="readout"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduced ? 0 : 0.18 }}
                    className="flex flex-col items-center"
                  >
                    {detail && (
                      <span
                        className="font-mono uppercase text-text-primary/80"
                        style={{ fontSize: fs(0.055, 9), letterSpacing: '0.25em' }}
                      >
                        {label}
                      </span>
                    )}
                    <span
                      className="numeric font-light leading-none text-ice text-glow-md"
                      style={{ fontSize: fs(0.3, 18) }}
                    >
                      {Math.round(v)}
                      <span className="text-text-muted" style={{ fontSize: fs(0.11, 12) }}>
                        {unit}
                      </span>
                    </span>
                    {detail && (
                      <span
                        className="numeric mt-1 uppercase text-text-muted"
                        style={{ fontSize: fs(0.05, 9), letterSpacing: '0.15em' }}
                      >
                        {sub}
                      </span>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </>
      )}
    </div>
  );
}
