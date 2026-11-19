import { Leaf, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fmtUsd, projectMonth, spendLevel, type UsageSummary } from '@shared/usage';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useUiStore } from '@renderer/stores/uiStore';

const BAR: Record<'ok' | 'warn' | 'over', string> = {
  ok: 'bg-accent',
  warn: 'bg-amber',
  over: 'bg-alert',
};

/** Claude spending this month in the top bar, with a bar towards the monthly limit.
 *  Click for Settings › AI › Spending. Shown once Claude is in use. */
export function SpendChip() {
  const budget = useSettingsStore((s) => s.settings.monthlyBudget);
  const provider = useSettingsStore((s) => s.settings.provider);
  const saver = useSettingsStore((s) => s.settings.saver);
  const [u, setU] = useState<UsageSummary | null>(null);

  useEffect(() => {
    const load = (): void => void window.arc.ai.usage().then(setU);
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  if (!u || (provider !== 'anthropic' && u.month === 0)) return null;
  const lvl = spendLevel(u.month, budget);
  const heading = projectMonth(u.month);
  const tip = [
    `Claude spending this month: ${fmtUsd(u.month)}${budget > 0 ? ` of ${fmtUsd(budget)}` : ''}`,
    `Today: ${fmtUsd(u.today)}`,
    `At this rate: about ${fmtUsd(heading)} this month`,
    budget > 0 ? '' : 'Set a monthly limit in Settings › AI to see a bar',
    'Click for details',
  ]
    .filter(Boolean)
    .join('\n');
  const text = lvl.tone === 'over' ? 'text-alert' : lvl.tone === 'warn' ? 'text-amber' : 'text-ice';

  const chip = (
    <button
      type="button"
      onClick={() => useUiStore.getState().openSettings('ai')}
      title={tip}
      aria-label={`Spending ${fmtUsd(u.month)} this month${budget > 0 ? ` of ${fmtUsd(budget)}` : ''}. Open spending`}
      className="no-drag flex h-7 shrink-0 flex-col justify-center gap-[3px] border border-line/70 px-2 hover:border-accent"
    >
      <span className={`flex items-center gap-1.5 font-mono text-[11px] tabular-nums ${text}`}>
        <Wallet size={12} strokeWidth={1.5} />
        {fmtUsd(u.month)}
        {budget > 0 && <span className="text-text-muted">/ {fmtUsd(budget)}</span>}
      </span>
      {budget > 0 && (
        <span className="block h-[3px] w-full overflow-hidden rounded-full bg-line" aria-hidden>
          <span
            className={`block h-full rounded-full ${BAR[lvl.tone]}`}
            style={{ width: `${Math.max(2, lvl.pct)}%` }}
          />
        </span>
      )}
    </button>
  );
  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => void useSettingsStore.getState().update({ saver: !saver })}
        title={
          saver
            ? 'Saver mode is on: the cheapest model for chat and research, fewer web searches, no background memory learning. Click to turn it off.'
            : 'Saver mode: spend less (cheapest model, fewer web searches). Click to turn it on.'
        }
        aria-pressed={saver}
        aria-label="Saver mode"
        className={`no-drag flex h-7 shrink-0 items-center gap-1 border px-1.5 font-mono text-[10px] uppercase tracking-[0.12em] ${
          saver
            ? 'border-ok bg-ok/10 text-ok'
            : 'border-line/70 text-text-muted hover:border-accent'
        }`}
      >
        <Leaf size={12} strokeWidth={1.5} />
        {saver ? 'Saver' : ''}
      </button>
      {chip}
    </span>
  );
}
