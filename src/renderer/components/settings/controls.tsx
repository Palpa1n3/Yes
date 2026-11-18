import { useId, type ReactNode } from 'react';

/** Labelled row: label + optional description on the left, control on the right. */
export function Field({
  label,
  hint,
  children,
  stacked = false,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  stacked?: boolean;
}) {
  return (
    <div
      className={`border-b border-line/40 py-3 last:border-0 ${stacked ? 'space-y-2' : 'flex items-center gap-4'}`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-text-primary">{label}</div>
        {hint && <div className="mt-0.5 text-[12px] leading-snug text-text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-1 flex items-center gap-3">
        <span className="hud-label">{title}</span>
        <span className="h-px flex-1 bg-line/70" aria-hidden />
      </h3>
      {children}
    </section>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange(v: boolean): void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${checked ? 'border-accent bg-accent/20' : 'border-line bg-panel-raised'}`}
    >
      <span
        className={`absolute top-[3px] h-3 w-3 transition-all ${checked ? 'left-[19px] bg-accent shadow-glow-sm' : 'left-[3px] bg-text-muted'}`}
      />
    </button>
  );
}

export function TextField({
  value,
  onChange,
  label,
  placeholder,
  maxLength = 40,
  width = 'w-40',
}: {
  value: string;
  onChange(v: string): void;
  label: string;
  placeholder?: string;
  maxLength?: number;
  width?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      placeholder={placeholder}
      maxLength={maxLength}
      spellCheck={false}
      className={`${width} h-8 shrink-0 border border-line bg-panel-raised/80 px-2 font-mono text-[12px] text-text-primary placeholder:text-text-muted/70 focus:border-accent focus:outline-none`}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange(v: T): void;
  options: Array<{ value: T; label: string }>;
  label: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      aria-label={label}
      className="h-8 shrink-0 border border-line bg-panel-raised px-2 font-mono text-[12px] text-text-primary focus:border-accent focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange(v: T): void;
  options: Array<{ value: T; label: string }>;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 border border-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${value === o.value ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-accent'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Stepped slider with tick labels (verbosity 1–5 etc.). */
export function Slider({
  value,
  min,
  max,
  onChange,
  label,
  labels,
}: {
  value: number;
  min: number;
  max: number;
  onChange(v: number): void;
  label: string;
  labels: string[];
}) {
  const id = useId();
  return (
    <div className="w-full">
      <div className="mb-1 flex items-baseline justify-between">
        <label htmlFor={id} className="text-[13px] text-text-primary">
          {label}
        </label>
        <span className="font-mono text-[11px] text-accent">{labels[value - min] ?? value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="hud-range w-full"
        aria-valuetext={labels[value - min]}
      />
      <div className="mt-0.5 flex justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-text-muted">
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}
