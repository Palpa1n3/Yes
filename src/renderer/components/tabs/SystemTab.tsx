import { X } from 'lucide-react';
import { Chip } from '@renderer/components/panels/Chip';
import { Panel } from '@renderer/components/panels/Panel';
import { RingGauge } from '@renderer/components/panels/RingGauge';
import { SegmentBar } from '@renderer/components/panels/SegmentBar';
import { Sparkline } from '@renderer/components/panels/Sparkline';
import { KeyValue, Stat } from '@renderer/components/panels/Stat';
import { useTween } from '@renderer/hooks/useTween';
import { fmtBytes, fmtUptime, loadTone } from '@renderer/lib/format';
import { useSystemStore } from '@renderer/stores/systemStore';
import { Columns } from './Columns';

function CoresPanel() {
  const stats = useSystemStore((s) => s.stats);
  const info = useSystemStore((s) => s.info);
  if (!stats) return null;
  return (
    <Panel
      code="CPU.01"
      title="Processor"
      chip={
        <Chip>{stats.cpu.speedGHz > 0 ? `${stats.cpu.speedGHz.toFixed(2)} GHz` : 'Clock n/a'}</Chip>
      }
      className="flex-1"
      bodyClassName="flex flex-col"
    >
      <div className="truncate text-[13px] text-text-primary" title={info?.cpuModel}>
        {info?.cpuModel ?? '—'}
      </div>
      <div className="micro-label mb-3">
        {stats.cpu.cores.length} threads ·{' '}
        {stats.cpu.temp !== null ? `${Math.round(stats.cpu.temp)}°C` : 'temp n/a'}
      </div>
      <div
        className="grid min-h-0 flex-1 gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${Math.min(8, Math.max(1, stats.cpu.cores.length))}, minmax(0, 1fr))`,
        }}
        role="list"
        aria-label="Per-thread load"
      >
        {stats.cpu.cores.map((c, i) => (
          <div
            key={i}
            role="listitem"
            className="flex min-h-0 flex-col items-center gap-1"
            title={`Thread ${i}: ${c}%`}
          >
            <div className="relative w-full flex-1 bg-line/40">
              <div
                className={`absolute inset-x-0 bottom-0 transition-[height] duration-700 ${loadTone(c) === 'accent' ? 'bg-accent/80' : 'bg-amber/90'}`}
                style={{ height: `${c}%` }}
              />
            </div>
            <span className="numeric text-[9px] text-text-muted">{i}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function MemoryPanel() {
  const stats = useSystemStore((s) => s.stats);
  if (!stats) return null;
  const { used, total, swapUsed, swapTotal } = stats.memory;
  const pct = (used / total) * 100;
  return (
    <Panel
      code="MEM.02"
      title="Memory"
      chip={
        <Chip tone={loadTone(pct) === 'accent' ? 'accent' : 'amber'}>{Math.round(pct)}% used</Chip>
      }
      className="shrink-0"
    >
      <div className="numeric text-[28px] font-extralight leading-none text-ice">
        {fmtBytes(used)} <span className="text-[12px] text-text-muted">/ {fmtBytes(total, 0)}</span>
      </div>
      <div className="mt-3">
        <SegmentBar value={pct} segments={28} tone={loadTone(pct)} label="Memory used" height={8} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Available" value={fmtBytes(total - used)} />
        <Stat label="Page file" value={`${fmtBytes(swapUsed)}`} />
        <Stat label="Of" value={fmtBytes(swapTotal, 0)} />
      </div>
    </Panel>
  );
}

function HistoryPanel({
  code,
  title,
  data,
  current,
  secondary,
  legend,
}: {
  code: string;
  title: string;
  data: number[];
  current: number;
  secondary?: number[];
  legend: string;
}) {
  const v = useTween(current);
  return (
    <Panel
      code={code}
      title={title}
      chip={<Chip tone="muted">60 s</Chip>}
      className="flex-1"
      bodyClassName="flex flex-col"
    >
      <div className="flex items-baseline justify-between">
        <span className="numeric text-[32px] font-extralight leading-none text-ice text-glow">
          {Math.round(v)}
          <span className="text-[12px] text-text-muted">%</span>
        </span>
        <span className="micro-label">{legend}</span>
      </div>
      <div className="relative mt-2 min-h-0 flex-1">
        <div className="absolute inset-0">
          <Sparkline
            data={data}
            secondary={secondary}
            max={100}
            height={160}
            grid
            className="!h-full"
          />
        </div>
      </div>
    </Panel>
  );
}

function ProcessesPanel() {
  const stats = useSystemStore((s) => s.stats);
  if (!stats) return null;
  return (
    <Panel
      code="PRC.05"
      title="Top processes"
      chip={<Chip tone="muted">By CPU</Chip>}
      className="flex-1"
      bodyClassName="!px-0 !py-0 overflow-y-auto"
    >
      <table className="w-full text-[12px]">
        <thead className="sticky top-0 bg-panel">
          <tr className="micro-label text-left">
            <th className="px-4 py-2 font-normal">Name</th>
            <th className="py-2 text-right font-normal">CPU</th>
            <th className="py-2 text-right font-normal">Mem</th>
            <th className="w-10">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {stats.processes.map((p) => (
            <tr key={p.pid} className="hud-row group border-t border-line/30">
              <td className="max-w-0 truncate px-4 py-1.5 text-text-primary" title={`PID ${p.pid}`}>
                {p.name}
              </td>
              <td
                className={`numeric py-1.5 text-right ${p.cpu > 20 ? 'text-amber' : 'text-accent'}`}
              >
                {p.cpu.toFixed(1)}%
              </td>
              <td className="numeric py-1.5 text-right text-text-muted">{fmtBytes(p.mem, 0)}</td>
              <td className="pr-3 text-right">
                <button
                  type="button"
                  disabled
                  aria-label={`End ${p.name}`}
                  title="Ending processes arrives with the command executor (Stage 7)"
                  className="text-text-muted opacity-0 transition-opacity group-hover:opacity-60 disabled:cursor-not-allowed"
                >
                  <X size={13} strokeWidth={1.5} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function GpuPanel() {
  const stats = useSystemStore((s) => s.stats);
  const gpu = stats?.gpu;
  return (
    <Panel
      code="GPU.06"
      title="Graphics"
      chip={
        <Chip tone="muted">{gpu?.temp != null ? `${Math.round(gpu.temp)}°C` : 'Temp n/a'}</Chip>
      }
      className="shrink-0"
    >
      {gpu ? (
        <div className="flex items-center gap-4">
          {gpu.load !== null ? (
            <RingGauge value={gpu.load} size={96} label="Load" tone={loadTone(gpu.load)} />
          ) : (
            <div className="grid h-24 w-24 shrink-0 place-items-center border border-line/60 text-center">
              <span className="micro-label">
                Load
                <br />
                n/a
              </span>
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="truncate text-[13px] text-text-primary">{gpu.name}</div>
            <KeyValue
              k="VRAM"
              v={
                gpu.memTotal === null
                  ? '—'
                  : gpu.memUsed === null
                    ? fmtBytes(gpu.memTotal, 0)
                    : `${fmtBytes(gpu.memUsed)} / ${fmtBytes(gpu.memTotal, 0)}`
              }
            />
            <KeyValue k="Uptime" v={stats ? fmtUptime(stats.uptime) : '—'} />
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-text-muted">No discrete GPU detected.</p>
      )}
    </Panel>
  );
}

export function SystemTab() {
  const stats = useSystemStore((s) => s.stats);
  const h = useSystemStore((s) => s.history);
  return (
    <Columns
      left={
        <>
          <CoresPanel />
          <MemoryPanel />
        </>
      }
      center={
        <>
          <HistoryPanel
            code="CPU.03"
            title="Processor history"
            data={h.cpu}
            current={stats?.cpu.load ?? 0}
            legend="CPU"
          />
          <HistoryPanel
            code="MEM.04"
            title="Memory & graphics history"
            data={h.mem}
            secondary={h.gpu}
            current={stats ? (stats.memory.used / stats.memory.total) * 100 : 0}
            legend="RAM ── GPU - -"
          />
        </>
      }
      right={
        <>
          <ProcessesPanel />
          <GpuPanel />
        </>
      }
    />
  );
}
