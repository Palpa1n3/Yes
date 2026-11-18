import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { usePersona } from '@renderer/hooks/usePersona';
import { playSfx } from '@renderer/voice/sfx';
import { startCountUp } from '@renderer/hooks/useTween';

export const BOOT_MS = 1800;
const SESSION_KEY = 'arc.booted';

/** Should the boot sequence play? Once per app session (survives dev reloads). */
export function shouldBoot(enabled: boolean, reduced: boolean): boolean {
  if (!enabled || reduced) return false;
  try {
    return sessionStorage.getItem(SESSION_KEY) !== '1';
  } catch {
    return true;
  }
}

const RINGS = [
  { r: 92, w: 1.5, dash: '', delay: 0.15 },
  { r: 70, w: 5, dash: '10 7', delay: 0.35 },
  { r: 52, w: 1, dash: '', delay: 0.55 },
  { r: 104, w: 1, dash: '1 5', delay: 0.05 },
];

/** ~1.8s start-up: grid fades in, rings draw on, status lines type, numbers count up.
 *  Any click or key skips it. */
export function BootSequence({ onDone }: { onDone(): void }) {
  const { personality, assistantName } = usePersona();
  const [visible, setVisible] = useState(true);
  const lines = [
    'Core online',
    'Telemetry link established',
    `Personality: ${personality.name}`,
    'All systems nominal',
  ];

  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* ignore */
    }
    playSfx('boot');
    startCountUp(BOOT_MS + 600);
    const t = setTimeout(() => setVisible(false), BOOT_MS);
    const skip = (): void => setVisible(false);
    window.addEventListener('keydown', skip, { once: true });
    window.addEventListener('pointerdown', skip, { once: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, []);

  return (
    <AnimatePresence onExitComplete={onDone}>
      {visible && (
        <motion.div
          key="boot"
          className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-void"
          exit={{ opacity: 0, transition: { duration: 0.35 } }}
          role="status"
          aria-label={`${assistantName} starting up. Press any key to skip.`}
        >
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            style={{
              backgroundImage:
                'linear-gradient(rgb(var(--accent) / 0.06) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--accent) / 0.06) 1px, transparent 1px)',
              backgroundSize: '56px 56px',
              backgroundPosition: 'center center',
            }}
          />
          <svg viewBox="-120 -120 240 240" className="relative h-56 w-56" aria-hidden>
            {RINGS.map((ring) => (
              <motion.circle
                key={ring.r}
                r={ring.r}
                fill="none"
                stroke="rgb(var(--accent))"
                strokeWidth={ring.w}
                strokeDasharray={ring.dash || undefined}
                initial={{ pathLength: 0, opacity: 0.2 }}
                animate={{ pathLength: 1, opacity: 0.9 }}
                transition={{ duration: 0.9, delay: ring.delay, ease: 'easeInOut' }}
                style={{ rotate: -90 }}
              />
            ))}
            {Array.from({ length: 12 }, (_, i) => (
              <motion.path
                key={i}
                d={describeSeg(i)}
                fill="none"
                stroke="rgb(var(--accent))"
                strokeWidth="10"
                initial={{ opacity: 0 }}
                animate={{ opacity: i % 5 === 1 ? 0.95 : 0.45 }}
                transition={{ delay: 0.6 + i * 0.05, duration: 0.2 }}
              />
            ))}
            <motion.circle
              r="36"
              fill="rgb(var(--accent))"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.35, 0.18] }}
              transition={{ delay: 0.9, duration: 0.8 }}
            />
          </svg>
          <motion.div
            className="relative mt-6 font-display text-[22px] font-semibold uppercase tracking-[0.5em] text-ice text-glow"
            initial={{ opacity: 0, letterSpacing: '1em' }}
            animate={{ opacity: 1, letterSpacing: '0.5em' }}
            transition={{ delay: 0.5, duration: 0.7 }}
          >
            {assistantName}
          </motion.div>
          <ul className="relative mt-5 h-20 space-y-1 font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
            {lines.map((l, i) => (
              <motion.li
                key={l}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.28, duration: 0.2 }}
              >
                <span className="text-accent">›</span> {l}
              </motion.li>
            ))}
          </ul>
          <motion.div
            className="relative mt-2 h-px w-56 origin-left bg-accent shadow-glow-sm"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: BOOT_MS / 1000, ease: 'linear' }}
          />
          <span className="micro-label relative mt-3">Press any key to skip</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function describeSeg(i: number): string {
  const a0 = ((i * 30 + 3) * Math.PI) / 180;
  const a1 = (((i + 1) * 30 - 3) * Math.PI) / 180;
  const r = 82;
  return `M ${Math.cos(a0) * r} ${Math.sin(a0) * r} A ${r} ${r} 0 0 1 ${Math.cos(a1) * r} ${Math.sin(a1) * r}`;
}
