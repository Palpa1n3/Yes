import { useEffect, useState } from 'react';
import { fmtUsd, type UsageSummary } from '@shared/usage';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { Field, Section } from './controls';

const FEATURE: Record<string, string> = {
  chat: 'Chat',
  research: 'Research',
  agent: 'Agent Mode',
  memory: 'Learning memories',
};

/** Estimated Claude spending (from the token counts on each reply) and a monthly limit. */
export function SpendingSection() {
  const { settings: s, update } = useSettingsStore();
  const [u, setU] = useState<UsageSummary | null>(null);
  useEffect(() => {
    const load = (): void => void window.arc.ai.usage().then(setU);
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);
  const max = Math.max(0.0001, ...(u?.days.map((d) => d.usd) ?? [0]));
  const pct = u && s.monthlyBudget ? Math.min(100, (u.month / s.monthlyBudget) * 100) : 0;
  return (
    <Section title="Spending">
      <div className="grid grid-cols-2 gap-3 py-2">
        <div className="rounded-[8px] border border-line/60 bg-panel/60 p-3">
          <div className="micro-label">Today</div>
          <div className="numeric text-[22px] font-light text-ice">{u ? fmtUsd(u.today) : '…'}</div>
        </div>
        <div className="rounded-[8px] border border-line/60 bg-panel/60 p-3">
          <div className="micro-label">This month</div>
          <div className="numeric text-[22px] font-light text-ice">{u ? fmtUsd(u.month) : '…'}</div>
          {s.monthlyBudget > 0 && (
            <div
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-line"
              aria-label={`${Math.round(pct)}% of the limit`}
            >
              <div
                className={`h-full ${pct >= 100 ? 'bg-alert' : pct >= 80 ? 'bg-amber' : 'bg-accent'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
      </div>
      {u && u.days.length > 0 && (
        <div
          className="flex h-16 items-end gap-[3px] py-1"
          aria-label="Spending per day, last 31 days"
        >
          {u.days.map((d) => (
            <div
              key={d.day}
              title={`${d.day}: ${fmtUsd(d.usd)} (${d.requests} requests)`}
              className="min-w-[4px] flex-1 rounded-t-[2px] bg-accent/70"
              style={{ height: `${Math.max(4, (d.usd / max) * 100)}%` }}
            />
          ))}
        </div>
      )}
      {u && Object.keys(u.byFeature).length > 0 && (
        <p className="py-1 text-[12px] text-text-muted">
          This month by feature:{' '}
          {Object.entries(u.byFeature)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `${FEATURE[k] ?? k} ${fmtUsd(v)}`)
            .join(' · ')}
        </p>
      )}
      <Field
        label="Monthly limit"
        hint="Alton warns you at 80% and 100% of this (in US dollars, like your Anthropic bill). These are estimates from each reply's size; your Anthropic console shows the exact bill, and you can set a hard limit there (console.anthropic.com › Limits). 0 = no warnings."
      >
        <span className="flex items-center gap-1 font-mono text-[12px] text-text-muted">
          $
          <input
            type="number"
            min={0}
            max={10000}
            defaultValue={s.monthlyBudget}
            onBlur={(e) =>
              void update({ monthlyBudget: Math.max(0, Math.round(Number(e.target.value) || 0)) })
            }
            aria-label="Monthly limit in dollars"
            className="h-8 w-20 rounded-[6px] border border-line bg-panel-raised px-2 text-text-primary focus:border-accent focus:outline-none"
          />
        </span>
      </Field>
    </Section>
  );
}
