import { Settings2 } from 'lucide-react';
import { useClock } from '@renderer/hooks/useClock';
import { fmtClock } from '@renderer/lib/format';
import { useSystemStore } from '@renderer/stores/systemStore';
import { useUiStore } from '@renderer/stores/uiStore';
import { Palette } from './Palette';
import { TimerChip } from './TimerChip';
import { TabBar } from './TabBar';
import { WindowControls } from './WindowControls';

interface Props {
  assistantName: string;
  maximized: boolean;
}

const dateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
});
const tzName = (): string =>
  new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
    .formatToParts(new Date())
    .find((p) => p.type === 'timeZoneName')?.value ?? '';

/** "Windows 11" → "Win 11" so host + OS fit beside the tabs. */
const shortOs = (name: string): string => name.replace(/^Windows/, 'Win');

export function TopBar({ assistantName, maximized }: Props) {
  const now = useClock();
  const info = useSystemStore((s) => s.info);

  return (
    <header
      className="drag relative z-10 flex h-14 shrink-0 items-stretch border-b border-line/70 bg-void/80"
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) window.arc.window.toggleMaximize();
      }}
    >
      {/* Wordmark */}
      <div className="flex min-w-0 max-w-[200px] shrink-0 flex-col justify-center pl-5 pr-6">
        <span className="font-display text-[14px] font-semibold uppercase leading-tight tracking-[0.3em] text-ice text-glow">
          {assistantName}
        </span>
        <span
          className="micro-label truncate"
          title={info ? `${info.hostname} / ${info.osName}` : undefined}
        >
          {info ? `${info.hostname} / ${shortOs(info.osName)}` : 'Connecting…'}
        </span>
      </div>

      <TabBar />

      <div className="ml-auto flex items-center gap-5 pl-4">
        <TimerChip />
        <Palette />
        <button
          type="button"
          aria-label="Settings (Ctrl+,)"
          title="Settings (Ctrl+,)"
          onClick={() => useUiStore.getState().openSettings()}
          className="no-drag text-text-muted transition-[color,filter] duration-150 hover:text-accent hover:[filter:drop-shadow(0_0_6px_rgb(var(--accent)/0.6))]"
        >
          <Settings2 size={16} strokeWidth={1.5} />
        </button>
        <div className="flex flex-col items-end leading-tight">
          <span
            className="numeric text-[20px] font-light text-ice text-glow"
            aria-label="Current time"
          >
            {fmtClock(now)}
          </span>
          <span className="micro-label whitespace-nowrap">
            {dateFmt.format(now).replace(/,/g, '')} · {tzName()}
          </span>
        </div>
        <div className="self-start">
          <WindowControls maximized={maximized} />
        </div>
      </div>
    </header>
  );
}
