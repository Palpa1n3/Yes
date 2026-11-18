import type { ReactNode } from 'react';

export type Tone = 'accent' | 'amber' | 'alert' | 'ok' | 'muted';

const TONES: Record<Tone, string> = {
  accent: 'border-accent/60 text-accent bg-accent/5',
  amber: 'border-amber/70 text-amber bg-amber/5',
  alert: 'border-alert/70 text-alert bg-alert/5',
  ok: 'border-ok/60 text-ok bg-ok/5',
  muted: 'border-line text-text-muted',
};

const DOT: Record<Tone, string> = {
  accent: 'bg-accent',
  amber: 'bg-amber',
  alert: 'bg-alert',
  ok: 'bg-ok',
  muted: 'bg-text-muted',
};

export function Chip({ tone = 'accent', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex h-5 min-w-0 max-w-[60%] items-center gap-1.5 rounded-[2px] border px-2 font-mono text-[10px] uppercase tracking-[0.14em] ${TONES[tone]}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 ${DOT[tone]}`} aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}

export function Dot({ tone }: { tone: Tone }) {
  return (
    <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${DOT[tone]}`} aria-hidden />
  );
}
