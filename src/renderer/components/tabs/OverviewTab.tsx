import { motion } from 'framer-motion';
import { ActivityLogPanel } from '@renderer/components/panels/ActivityLogPanel';
import { AgendaPanel } from '@renderer/components/panels/AgendaPanel';
import { TimersPanel } from '@renderer/components/panels/TimersPanel';
import { Chip } from '@renderer/components/panels/Chip';
import { panelVariants, Panel } from '@renderer/components/panels/Panel';
import { SegmentBar } from '@renderer/components/panels/SegmentBar';
import { Sparkline } from '@renderer/components/panels/Sparkline';
import { Stat } from '@renderer/components/panels/Stat';
import { CoreDisplay } from '@renderer/components/core/CoreDisplay';
import { ConsolePanel } from '@renderer/components/transcript/ConsolePanel';
import { useGreeting } from '@renderer/hooks/useGreeting';
import { usePersona } from '@renderer/hooks/usePersona';
import { useTween } from '@renderer/hooks/useTween';
import { fmtBytes, fmtRate, fmtUptime, loadTone } from '@renderer/lib/format';
import { readAudioLevel, useAssistantStore } from '@renderer/stores/assistantStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useSystemStore } from '@renderer/stores/systemStore';
import { WeatherPanel } from '@renderer/components/weather/WeatherPanel';
import { Columns } from './Columns';

/* ── Left ──────────────────────────────────────────── */

function VitalsPanel() {
  const stats = useSystemStore((s) => s.stats);
  const cpuHist = useSystemStore((s) => s.history.cpu);
  const cpu = useTween(stats?.cpu.load ?? 0);
  if (!stats) return null;

  const memPct = (stats.memory.used / stats.memory.total) * 100;
  const gpu = stats.gpu?.load ?? null;
  const hot = (stats.cpu.temp ?? 0) >= 80 || (stats.gpu?.temp ?? 0) >= 80;
  // Windows often hides CPU temperature from non-admin apps; don't claim "OK" without data.
  const noTemps = stats.cpu.temp === null && stats.gpu?.temp == null;
  const rows = [
    { k: 'Processor', v: stats.cpu.load },
    { k: 'Memory', v: memPct },
    ...(gpu !== null ? [{ k: 'Graphics', v: gpu }] : []),
  ];

  return (
    <Panel
      code="SYS.03"
      title="Vitals"
      chip={
        noTemps ? (
          <Chip tone="muted">No temp data</Chip>
        ) : (
          <Chip tone={hot ? 'amber' : 'ok'}>{hot ? 'Running hot' : 'Thermal OK'}</Chip>
        )
      }
      className="shrink-0"
    >
      <div className="flex items-end gap-3">
        <div className="numeric text-[34px] font-extralight leading-none text-ice text-glow">
          {Math.round(cpu)}
          <span className="ml-1 text-[11px] text-text-muted">% CPU</span>
        </div>
        <Sparkline data={cpuHist} max={100} height={34} className="flex-1" />
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.k}>
            <div className="flex justify-between">
              <span className="micro-label">{r.k}</span>
              <span
                className={`numeric text-[11px] ${loadTone(r.v) === 'accent' ? 'text-accent' : 'text-amber'}`}
              >
                [ {Math.round(r.v)}% ]
              </span>
            </div>
            <SegmentBar value={r.v} segments={24} tone={loadTone(r.v)} label={r.k} />
          </div>
        ))}
      </div>
      <div className="micro-label mt-3 truncate text-accent/80">
        {[
          stats.cpu.temp !== null && `CPU ${Math.round(stats.cpu.temp)}°C`,
          stats.gpu?.temp != null && `GPU ${Math.round(stats.gpu.temp)}°C`,
          `RAM ${fmtBytes(stats.memory.used)}`,
          `UP ${fmtUptime(stats.uptime)}`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </div>
    </Panel>
  );
}

/* ── Centre ────────────────────────────────────────── */

function useFlags(): string[] {
  const stats = useSystemStore((s) => s.stats);
  if (!stats) return [];
  const flags: string[] = [];
  for (const d of stats.disks) if (d.used / d.size >= 0.9) flags.push(`${d.mount} nearly full`);
  if ((stats.cpu.temp ?? 0) >= 80) flags.push('CPU running hot');
  if (stats.memory.used / stats.memory.total >= 0.9) flags.push('Memory pressure');
  return flags;
}

function Greeting() {
  const { salutation, part } = useGreeting();
  const { title } = usePersona();
  const flags = useFlags();
  return (
    <motion.div variants={panelVariants} className="shrink-0 pt-1 text-center">
      <h2 className="font-alt text-[34px] font-medium leading-tight text-ice">
        {salutation}
        {title && (
          <>
            , <span className="text-accent text-glow-md">{title}</span>
          </>
        )}
        {part === 'lateNight' ? '?' : '.'}
      </h2>
      <p className="font-alt text-[16px] text-text-primary/80">
        {flags.length === 0
          ? 'All systems nominal. Nothing needs your attention.'
          : `All systems nominal. ${flags.length} item${flags.length > 1 ? 's' : ''} flagged for your attention.`}
      </p>
    </motion.div>
  );
}

function Core() {
  const stats = useSystemStore((s) => s.stats);
  const info = useSystemStore((s) => s.info);
  const { state, stateDetail } = useAssistantStore();
  const theme = useSettingsStore((s) => s.settings.theme);
  const memPct = stats ? (stats.memory.used / stats.memory.total) * 100 : 0;
  const ring = info
    ? `${info.cpuModel} // ${info.cpuThreads} THREADS // ${fmtBytes(info.memTotal, 0)} MEMORY // ${info.osName} // ${info.hostname} //`.toUpperCase()
    : 'INITIALISING //';
  return (
    <motion.div variants={panelVariants} className="min-h-0 flex-1">
      <CoreDisplay
        state={state}
        stateDetail={stateDetail}
        getLevel={readAudioLevel}
        themeKey={theme}
        label="System load"
        value={stats?.cpu.load ?? 0}
        unit="%"
        sub={[
          `RAM ${Math.round(memPct)}%`,
          stats?.gpu?.load != null && `GPU ${Math.round(stats.gpu.load)}%`,
        ]
          .filter(Boolean)
          .join(' · ')}
        ringText={ring}
        connectors={[
          { angle: 215, label: 'AZ 315 / WX' },
          { angle: 145, label: 'AZ 225 / SYS' },
          { angle: 325, label: 'AZ 045 / NET' },
          { angle: 35, label: 'AZ 135 / DSK' },
        ]}
      />
    </motion.div>
  );
}

/* ── Right ─────────────────────────────────────────── */

function NetworkPanel() {
  const stats = useSystemStore((s) => s.stats);
  const down = useSystemStore((s) => s.history.down);
  const up = useSystemStore((s) => s.history.up);
  const rate = useTween(stats?.network.down ?? 0);
  if (!stats) return null;
  return (
    <Panel code="NET.04" title="Network" chip={<Chip tone="ok">Online</Chip>} className="shrink-0">
      <div className="flex items-baseline justify-between">
        <span className="numeric text-[30px] font-extralight leading-none text-ice text-glow">
          {fmtRate(rate).split(' ')[0]}
          <span className="ml-1 text-[11px] text-text-muted">{fmtRate(rate).split(' ')[1]}</span>
        </span>
        <span className="micro-label">↓ {stats.network.iface}</span>
      </div>
      <Sparkline data={down} secondary={up} height={44} className="mt-2" />
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Stat label="Upload" value={fmtRate(stats.network.up)} />
        <Stat
          label="Ping"
          value={
            stats.network.latencyMs === null ? '—' : `${Math.round(stats.network.latencyMs)} ms`
          }
        />
        <Stat
          label="Since boot"
          value={fmtBytes(stats.network.rxTotal + stats.network.txTotal)}
          accent
        />
      </div>
    </Panel>
  );
}

function DrivesPanel() {
  const stats = useSystemStore((s) => s.stats);
  if (!stats) return null;
  const warn = stats.disks.filter((d) => d.used / d.size >= 0.9).length;
  return (
    <Panel
      code="DSK.05"
      title="Drives"
      chip={<Chip tone={warn ? 'amber' : 'ok'}>{warn ? `${warn} low` : 'Healthy'}</Chip>}
      className="shrink-0"
    >
      <ul className="space-y-2">
        {stats.disks.map((d) => {
          const pct = (d.used / d.size) * 100;
          const tone = loadTone(pct, 85, 95);
          return (
            <li
              key={d.id}
              className="grid grid-cols-[1.8rem_minmax(0,2.6rem)_minmax(0,1fr)_auto] items-center gap-2"
            >
              <span
                className={`numeric text-[13px] ${tone === 'accent' ? 'text-text-primary' : 'text-amber'}`}
              >
                {d.mount}
              </span>
              <span className="micro-label">{d.kind}</span>
              <SegmentBar value={pct} segments={16} tone={tone} label={`${d.mount} used`} />
              <span
                className={`numeric text-right text-[11px] ${tone === 'accent' ? 'text-accent' : 'text-amber'}`}
              >
                {fmtBytes(d.size - d.used, 0)}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export function OverviewTab() {
  const { assistantName } = useSettingsStore((s) => s.settings);
  return (
    <Columns
      left={
        <>
          <TimersPanel className="shrink-0" />
          <WeatherPanel className="shrink-0" />
          <VitalsPanel />
        </>
      }
      center={
        <>
          <Greeting />
          <Core />
          <ConsolePanel
            assistantName={assistantName}
            className="h-[clamp(200px,40%,320px)] shrink-0"
          />
        </>
      }
      right={
        <>
          <NetworkPanel />
          <DrivesPanel />
          <AgendaPanel className="max-h-[260px] shrink-0" />
          <ActivityLogPanel className="min-h-[120px] flex-1" />
        </>
      }
    />
  );
}
