import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Lock, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { sortTasks, type TaskInfo, type TaskKind, type TaskSort } from '@shared/tasks';
import { Chip } from '@renderer/components/panels/Chip';
import { panelVariants, Panel } from '@renderer/components/panels/Panel';
import { SegmentBar } from '@renderer/components/panels/SegmentBar';
import { Stat } from '@renderer/components/panels/Stat';
import { fmtBytes, loadTone } from '@renderer/lib/format';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import { useSystemStore } from '@renderer/stores/systemStore';

type Filter = 'all' | TaskKind;
const SECTIONS: Array<{ kind: TaskKind; title: string }> = [
  { kind: 'app', title: 'Apps' },
  { kind: 'background', title: 'Background processes' },
  { kind: 'windows', title: 'Windows processes' },
];
const POLL_MS = 2000;

interface Confirm {
  name: string;
  label: string;
  message: string;
}

/** Keeps the list fresh while the tab is open (main samples processes on demand). */
function useTaskList(): { tasks: TaskInfo[] | null; refresh(): void } {
  const [tasks, setTasks] = useState<TaskInfo[] | null>(null);
  const tick = useRef<() => void>(() => undefined);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async (): Promise<void> => {
      clearTimeout(timer);
      try {
        const r = await window.arc.tasks.list();
        if (!alive) return;
        if (r.tasks) setTasks(r.tasks);
        // The first call only takes a baseline; the next one has real CPU numbers.
        timer = setTimeout(() => void load(), r.tasks ? POLL_MS : 800);
      } catch {
        if (alive) timer = setTimeout(() => void load(), POLL_MS * 2);
      }
    };
    tick.current = () => void load();
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
  return { tasks, refresh: () => tick.current() };
}

function SortHeader({
  label,
  by,
  sort,
  desc,
  onSort,
  className = '',
}: {
  label: string;
  by: TaskSort;
  sort: TaskSort;
  desc: boolean;
  onSort(by: TaskSort): void;
  className?: string;
}) {
  const active = sort === by;
  return (
    <th
      className={`py-2 font-normal ${className}`}
      aria-sort={active ? (desc ? 'descending' : 'ascending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(by)}
        className={`inline-flex items-center gap-1 uppercase tracking-[0.14em] hover:text-accent ${active ? 'text-accent' : ''}`}
      >
        {label}
        {active && (desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
      </button>
    </th>
  );
}

export function TasksTab() {
  const { tasks, refresh } = useTaskList();
  const stats = useSystemStore((s) => s.stats);
  const log = useAssistantStore((s) => s.logActivity);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<TaskSort>('cpu');
  const [desc, setDesc] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const watch = useRef<{ name: string; label: string; until: number } | null>(null);

  // After a polite close, offer Force end if the app is still there a few seconds later.
  useEffect(() => {
    const w = watch.current;
    if (!w || !tasks) return;
    const still = tasks.some((t) => t.name.toLowerCase() === w.name.toLowerCase());
    if (!still) watch.current = null;
    else if (Date.now() > w.until) {
      watch.current = null;
      setConfirm({
        name: w.name,
        label: w.label,
        message: `${w.label} is still running. It may be waiting for you to save something.`,
      });
    }
  }, [tasks]);

  const onSort = (by: TaskSort): void => {
    if (by === sort) setDesc((d) => !d);
    else {
      setSort(by);
      setDesc(by !== 'name');
    }
  };

  const end = async (t: Pick<TaskInfo, 'name' | 'label'>, force: boolean): Promise<void> => {
    setBusy(t.name);
    setConfirm(null);
    setNotice(null);
    try {
      const r = await window.arc.tasks.end(t.name, force);
      setNotice({ text: r.message, ok: r.ok });
      log({
        kind: 'app',
        label: `${force ? 'Force end' : 'End task'} ${t.label}: ${r.message}`,
        status: r.ok ? 'success' : 'failed',
      });
      if (r.ok && !force)
        watch.current = { name: t.name, label: t.label, until: Date.now() + 3500 };
      if (!r.ok && r.canForce)
        setConfirm({
          name: t.name,
          label: t.label,
          message: `${t.label} didn't close when asked.`,
        });
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const shown = useMemo(() => {
    if (!tasks) return [];
    const q = query.trim().toLowerCase();
    const list = tasks.filter(
      (t) =>
        (filter === 'all' || t.kind === filter) &&
        (!q || t.label.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)),
    );
    return sortTasks(list, sort, desc);
  }, [tasks, query, filter, sort, desc]);

  const counts = useMemo(() => {
    const c = { app: 0, background: 0, windows: 0 };
    for (const t of tasks ?? []) c[t.kind] += t.count;
    return c;
  }, [tasks]);
  const total = counts.app + counts.background + counts.windows;
  const memPct = stats ? (stats.memory.used / stats.memory.total) * 100 : 0;

  const row = (t: TaskInfo) => (
    <tr key={t.name} className="hud-row group border-t border-line/30">
      <td className="max-w-0 truncate px-4 py-1.5 text-text-primary" title={`${t.name}.exe`}>
        {t.label}
        {t.count > 1 && (
          <span className="ml-1.5 font-mono text-[10px] text-text-muted">×{t.count}</span>
        )}
      </td>
      <td className="py-1.5 text-[11px]">
        {!t.responding && (
          <span className="font-mono uppercase tracking-[0.1em] text-alert">Not responding</span>
        )}
      </td>
      <td className="py-1.5 pr-4">
        <div className="flex items-center justify-end gap-2">
          <div className="hidden w-16 xl:block">
            <SegmentBar
              value={Math.min(100, t.cpu * 2)}
              segments={8}
              tone={loadTone(t.cpu * 2)}
              label={`${t.label} CPU`}
              height={4}
            />
          </div>
          <span className={`numeric w-12 text-right ${t.cpu >= 20 ? 'text-amber' : 'text-accent'}`}>
            {t.cpu.toFixed(1)}%
          </span>
        </div>
      </td>
      <td className="numeric py-1.5 pr-4 text-right text-text-muted">
        {fmtBytes(t.mem, t.mem > 1024 ** 3 ? 1 : 0)}
      </td>
      <td className="w-28 pr-3 text-right">
        {t.protected ? (
          <span
            className="inline-flex text-text-muted/60"
            title="Part of Windows or ARC: can't be ended here"
          >
            <Lock size={12} strokeWidth={1.5} />
          </span>
        ) : (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void end(t, false)}
            aria-label={`End task: ${t.label}`}
            className={`hud-button !py-0.5 transition-opacity group-hover:opacity-100 focus:opacity-100 ${t.responding ? 'opacity-0' : 'opacity-100 !text-alert'}`}
          >
            {busy === t.name ? '…' : 'End task'}
          </button>
        )}
      </td>
    </tr>
  );

  return (
    <motion.div
      variants={panelVariants}
      initial="hidden"
      animate="show"
      className="flex h-full min-h-0 flex-col gap-4"
    >
      <div className="grid shrink-0 grid-cols-4 gap-4">
        <Panel code="TSK.01" title="Processor" className="!min-h-0">
          <div className="numeric text-[26px] font-extralight leading-none text-ice">
            {Math.round(stats?.cpu.load ?? 0)}
            <span className="text-[12px] text-text-muted">%</span>
          </div>
          <div className="mt-2">
            <SegmentBar
              value={stats?.cpu.load ?? 0}
              segments={24}
              tone={loadTone(stats?.cpu.load ?? 0)}
              label="CPU"
              height={6}
            />
          </div>
        </Panel>
        <Panel code="TSK.02" title="Memory" className="!min-h-0">
          <div className="numeric text-[26px] font-extralight leading-none text-ice">
            {stats ? fmtBytes(stats.memory.used) : '—'}
            <span className="text-[12px] text-text-muted">
              {' '}
              / {stats ? fmtBytes(stats.memory.total, 0) : '—'}
            </span>
          </div>
          <div className="mt-2">
            <SegmentBar
              value={memPct}
              segments={24}
              tone={loadTone(memPct)}
              label="Memory"
              height={6}
            />
          </div>
        </Panel>
        <Panel code="TSK.03" title="Running" className="col-span-2 !min-h-0">
          <div className="grid grid-cols-4 gap-3">
            <Stat label="Apps" value={tasks ? counts.app : '—'} accent />
            <Stat label="Background" value={tasks ? counts.background : '—'} />
            <Stat label="Windows" value={tasks ? counts.windows : '—'} />
            <Stat label="Total" value={tasks ? total : '—'} />
          </div>
          <p className="mt-2 text-[11px] text-text-muted">
            End task asks an app to close (like clicking ×), so it can still ask you to save.
          </p>
        </Panel>
      </div>

      <Panel
        code="TSK.04"
        title="Task manager"
        chip={tasks ? <Chip tone="muted">Live · 2 s</Chip> : <Chip tone="muted">Measuring…</Chip>}
        className="min-h-0 flex-1"
        bodyClassName="!px-0 !py-0 flex min-h-0 flex-col"
      >
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line/40 px-4 py-2">
          <label className="relative flex items-center">
            <Search size={12} className="pointer-events-none absolute left-2 text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name"
              aria-label="Search processes"
              spellCheck={false}
              className="h-7 w-56 border border-line bg-panel-raised/80 pl-7 pr-2 font-mono text-[12px] text-text-primary placeholder:text-text-muted/70 focus:border-accent focus:outline-none"
            />
          </label>
          <div role="radiogroup" aria-label="Show" className="flex border border-line">
            {(['all', 'app', 'background', 'windows'] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={filter === f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${filter === f ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-accent'}`}
              >
                {f === 'all'
                  ? 'All'
                  : f === 'app'
                    ? 'Apps'
                    : f === 'background'
                      ? 'Background'
                      : 'Windows'}
              </button>
            ))}
          </div>
          {notice && !confirm && (
            <span
              className={`ml-auto flex items-center gap-1.5 text-[12px] ${notice.ok ? 'text-ok' : 'text-alert'}`}
              role="status"
            >
              {notice.text}
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setNotice(null)}
                className="text-text-muted hover:text-accent"
              >
                <X size={12} />
              </button>
            </span>
          )}
          {confirm && (
            <span
              className="ml-auto flex flex-wrap items-center gap-2 border border-amber/60 bg-amber/5 px-2 py-1 text-[12px]"
              role="alertdialog"
              aria-label="Force end"
            >
              <span className="text-amber">
                {confirm.message} Force end it? Unsaved work will be lost.
              </span>
              <button
                type="button"
                className="hud-button !py-0.5 !text-alert"
                onClick={() => void end(confirm, true)}
              >
                Force end
              </button>
              <button type="button" className="hud-button !py-0.5" onClick={() => setConfirm(null)}>
                Cancel
              </button>
            </span>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!tasks ? (
            <p className="px-4 py-3 text-[13px] text-text-muted">
              Measuring what each app is using…
            </p>
          ) : (
            <table className="w-full table-fixed text-[12px]">
              <colgroup>
                <col />
                <col className="w-32" />
                <col className="w-44" />
                <col className="w-28" />
                <col className="w-28" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-panel">
                <tr className="micro-label text-left">
                  <SortHeader
                    label="Name"
                    by="name"
                    sort={sort}
                    desc={desc}
                    onSort={onSort}
                    className="px-4"
                  />
                  <th className="py-2 font-normal">Status</th>
                  <SortHeader
                    label="CPU"
                    by="cpu"
                    sort={sort}
                    desc={desc}
                    onSort={onSort}
                    className="pr-4 text-right"
                  />
                  <SortHeader
                    label="Memory"
                    by="mem"
                    sort={sort}
                    desc={desc}
                    onSort={onSort}
                    className="pr-4 text-right"
                  />
                  <th className="py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              {filter === 'all' && !query ? (
                SECTIONS.map(({ kind, title }) => {
                  const rows = shown.filter((t) => t.kind === kind);
                  if (!rows.length) return null;
                  return (
                    <tbody key={kind}>
                      <tr>
                        <th
                          colSpan={5}
                          className="micro-label bg-panel-raised/40 px-4 py-1.5 text-left font-normal text-accent"
                        >
                          {title} ({rows.length})
                        </th>
                      </tr>
                      {rows.map(row)}
                    </tbody>
                  );
                })
              ) : (
                <tbody>
                  {shown.map(row)}
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-text-muted">
                        Nothing matches.
                      </td>
                    </tr>
                  )}
                </tbody>
              )}
            </table>
          )}
        </div>
      </Panel>
    </motion.div>
  );
}
