import type { ReactNode } from 'react';

/** Small label-over-value readout used in panel stat rows. */
export function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="micro-label truncate">{label}</div>
      <div
        className={`numeric truncate text-[13px] ${accent ? 'text-accent' : 'text-text-primary'}`}
      >
        {value}
      </div>
    </div>
  );
}

/** Row of "label ......... value" pairs. */
export function KeyValue({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/30 py-1.5 last:border-0">
      <span className="micro-label">{k}</span>
      <span className="numeric truncate text-[12px] text-text-primary">{v}</span>
    </div>
  );
}
