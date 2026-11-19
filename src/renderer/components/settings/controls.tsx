import { createContext, useContext, useId, type ReactNode } from 'react';

/** The settings search text; rows that don't match hide themselves. */
export const SettingsSearch = createContext('');

const textOf = (n: ReactNode): string =>
  typeof n === 'string' || typeof n === 'number' ? String(n) : '';

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
  const q = useContext(SettingsSearch).trim().toLowerCase();
  const match = !q || `${label} ${textOf(hint)}`.toLowerCase().includes(q);
  return (
    <div
      hidden={!match}
      className={`settings-field border-b border-line/30 py-3 last:border-0 ${stacked ? 'space-y-2' : 'flex items-center gap-4'}`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-text-primary">{label}</div>
        {hint && <div className="mt-0.5 text-[12px] leading-snug text-text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

/** A card of related settings. Hidden while searching if none of its rows match. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  const q = useContext(SettingsSearch).trim().toLowerCase();
  const titleMatch = !!q && title.toLowerCase().includes(q);
  return (
    <SettingsSearch.Provider value={titleMatch ? '' : q}>
      <section
        className="settings-section mb-4 rounded-[10px] border border-line/60 bg-panel-raised/35 px-4 pb-1 pt-3 shadow-[inset_0_1px_0_rgb(var(--ice)/0.03)]"
        data-searching={q && !titleMatch ? 'true' : undefined}
      >
        <h3 className="mb-1 flex items-center gap-2">
          <span
            className="h-1.5 w-1.5 rotate-45 bg-accent shadow-[0_0_6px_rgb(var(--accent))]"
            aria-hidden
          />
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ice">
            {title}
          </span>
        </h3>
        {children}
      </section>
    </SettingsSearch.Provider>
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
      className={`relative h-[22px] w-10 shrink-0 rounded-full border transition-[background-color,border-color,box-shadow] duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${checked ? 'border-accent bg-accent/25 shadow-glow-sm' : 'border-line bg-panel-raised'}`}
    >
      <span
        className={`absolute top-[3px] h-3.5 w-3.5 rounded-full transition-all duration-200 ${checked ? 'left-[21px] bg-accent shadow-[0_0_8px_rgb(var(--accent))]' : 'left-[3px] bg-text-muted'}`}
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
      className={`${width} h-8 shrink-0 rounded-[6px] border border-line bg-panel-raised/80 px-2 font-mono text-[12px] text-text-primary placeholder:text-text-muted/70 focus:border-accent focus:outline-none`}
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
      className="h-8 shrink-0 rounded-[6px] border border-line bg-panel-raised px-2 font-mono text-[12px] text-text-primary focus:border-accent focus:outline-none"
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
    <div
      role="radiogroup"
      aria-label={label}
      className="flex shrink-0 gap-0.5 rounded-[7px] border border-line bg-panel-raised/60 p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-[5px] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${value === o.value ? 'bg-accent/20 text-accent shadow-[inset_0_0_0_1px_rgb(var(--accent)/0.5)]' : 'text-text-muted hover:text-accent'}`}
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
