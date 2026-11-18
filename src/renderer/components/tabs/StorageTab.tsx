import { Download, FolderOpen, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DownloadItem, FolderSize } from '@shared/types';
import { Chip } from '@renderer/components/panels/Chip';
import { Panel } from '@renderer/components/panels/Panel';
import { RingGauge } from '@renderer/components/panels/RingGauge';
import { SegmentBar } from '@renderer/components/panels/SegmentBar';
import { fmtBytes, loadTone } from '@renderer/lib/format';
import { useSystemStore } from '@renderer/stores/systemStore';
import { Columns } from './Columns';

function ago(ms: number): string {
  const m = Math.round((Date.now() - ms) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days`;
}

/** Folder scan results survive switching tabs (scans take a few seconds). */
let lastScan: { at: number; sizes: FolderSize[] } | null = null;

export function StorageTab() {
  const disks = useSystemStore((s) => s.stats?.disks ?? []);
  const isWindows = useSystemStore((s) => s.info?.platform === 'win32');
  const [downloads, setDownloads] = useState<DownloadItem[] | null>(null);
  const [scan, setScan] = useState(lastScan);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    void window.arc.storage.downloads().then(setDownloads);
  }, []);

  const runScan = (): void => {
    setScanning(true);
    void window.arc.storage
      .scan()
      .then((sizes) => {
        lastScan = { at: Date.now(), sizes };
        setScan(lastScan);
      })
      .finally(() => setScanning(false));
  };

  const sizes = scan?.sizes ?? [];
  const maxFolder = Math.max(1, ...sizes.map((f) => f.bytes));
  const temp = sizes.find((f) => f.id === 'temp');
  const dl = sizes.find((f) => f.id === 'downloads');
  const fullest = [...disks].sort((a, b) => b.used / b.size - a.used / a.size)[0];

  const suggestions: Array<{
    id: string;
    label: string;
    detail: string;
    size?: number;
    action(): void;
    actionLabel: string;
  }> = [];
  if (temp && temp.bytes > 200 * 1024 ** 2) {
    suggestions.push({
      id: 'temp',
      label: 'Temporary files',
      detail: 'Safe to clear once apps are closed',
      size: temp.bytes,
      action: () => window.arc.storage.openSpecial('temp'),
      actionLabel: 'Open',
    });
  }
  if (dl?.oldBytes && dl.oldBytes > 500 * 1024 ** 2) {
    suggestions.push({
      id: 'old-dl',
      label: 'Old downloads',
      detail: 'Untouched for 90+ days',
      size: dl.oldBytes,
      action: () => window.arc.apps.openFolder('downloads'),
      actionLabel: 'Open',
    });
  }
  if (isWindows) {
    suggestions.push({
      id: 'bin',
      label: 'Recycle Bin',
      detail: 'Empty it to reclaim the space',
      action: () => window.arc.storage.openSpecial('recycleBin'),
      actionLabel: 'Open',
    });
  }
  if (fullest && fullest.used / fullest.size > 0.85) {
    suggestions.unshift({
      id: 'disk',
      label: `${fullest.mount} is ${Math.round((fullest.used / fullest.size) * 100)}% full`,
      detail: 'Consider moving large folders to another drive',
      action: () => window.arc.apps.openFolder('documents'),
      actionLabel: 'Open',
    });
  }

  return (
    <Columns
      left={
        <Panel
          code="FLD.01"
          title="Folder sizes"
          chip={
            <button
              type="button"
              className="hud-button !py-0.5"
              onClick={runScan}
              disabled={scanning}
              aria-label="Scan folder sizes"
            >
              <RefreshCw size={11} strokeWidth={1.5} className={scanning ? 'animate-spin' : ''} />
              {scanning ? 'Scanning' : scan ? 'Rescan' : 'Scan'}
            </button>
          }
          className="flex-1"
          bodyClassName="overflow-y-auto"
        >
          {!scan && !scanning && (
            <p className="text-[13px] text-text-muted">
              Measure your Documents, Downloads, Desktop, Pictures, Videos, Music and Temp folders.
              Takes a few seconds.
            </p>
          )}
          {scanning && !scan && (
            <p className="text-[13px] text-text-muted">
              Scanning… large folders can take up to ~8 s each.
            </p>
          )}
          <ul className="space-y-3">
            {sizes.map((f) => (
              <li key={f.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] text-text-primary" title={f.path}>
                    {f.name}
                  </span>
                  <span className="numeric shrink-0 text-[11px] text-accent">
                    {f.complete ? '' : '≥ '}
                    {fmtBytes(f.bytes)}
                  </span>
                </div>
                <SegmentBar
                  value={(f.bytes / maxFolder) * 100}
                  segments={24}
                  height={4}
                  label={f.name}
                />
                <div className="micro-label mt-0.5 normal-case">
                  {f.files.toLocaleString()} files
                </div>
              </li>
            ))}
          </ul>
          {scan && (
            <p className="micro-label mt-3 normal-case">
              Scanned {ago(scan.at) === 'just now' ? 'just now' : `${ago(scan.at)} ago`}
              {sizes.some((s) => !s.complete) ? ' · ≥ means the scan hit its time limit' : ''}
            </p>
          )}
        </Panel>
      }
      center={
        <>
          <Panel
            code="DSK.02"
            title="Drives"
            chip={<Chip>{disks.length} mounted</Chip>}
            className="flex-1"
            bodyClassName="grid grid-cols-2 place-items-center gap-2 overflow-y-auto"
          >
            {disks.map((d) => {
              const pct = (d.used / d.size) * 100;
              return (
                <div key={d.id} className="flex flex-col items-center">
                  <RingGauge
                    value={pct}
                    size={128}
                    label={`${d.mount} ${d.label === d.mount ? '' : d.label}`.trim()}
                    sub={`${fmtBytes(d.size - d.used, 0)} free`}
                    tone={loadTone(pct, 85, 95)}
                  />
                  <span className="micro-label">
                    {d.kind === 'local' ? 'Fixed disk' : d.kind} · {fmtBytes(d.size, 0)}
                  </span>
                </div>
              );
            })}
            {disks.length === 0 && (
              <p className="col-span-2 text-[13px] text-text-muted">Reading drives…</p>
            )}
          </Panel>
          <Panel
            code="DWN.03"
            title="Recent downloads"
            chip={
              <button
                type="button"
                className="hud-button !py-0.5"
                onClick={() => window.arc.apps.openFolder('downloads')}
              >
                <FolderOpen size={11} strokeWidth={1.5} /> Open
              </button>
            }
            className="shrink-0"
          >
            {downloads?.length === 0 && (
              <p className="text-[13px] text-text-muted">Your Downloads folder is empty.</p>
            )}
            <ul>
              {(downloads ?? []).slice(0, 5).map((f) => (
                <li key={f.name}>
                  <button
                    type="button"
                    onClick={() => window.arc.storage.reveal(f.name)}
                    title="Show in folder"
                    className="hud-row flex w-full items-center gap-3 border-b border-line/30 py-1.5 text-left text-[13px] last:border-0"
                  >
                    <Download size={14} strokeWidth={1.5} className="shrink-0 text-accent" />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="numeric text-[11px] text-text-muted">{fmtBytes(f.size)}</span>
                    <span className="micro-label w-16 text-right">{ago(f.modified)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      }
      right={
        <Panel
          code="CLN.04"
          title="Cleanup"
          chip={<Chip tone="muted">Suggestions</Chip>}
          className="flex-1"
          bodyClassName="flex flex-col overflow-y-auto"
        >
          <ul className="flex-1">
            {suggestions.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 border-b border-line/30 py-2.5 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-text-primary">{c.label}</div>
                  <div className="micro-label truncate normal-case">{c.detail}</div>
                </div>
                {c.size !== undefined && (
                  <span className="numeric text-[12px] text-amber">{fmtBytes(c.size)}</span>
                )}
                <button type="button" className="hud-button" onClick={c.action}>
                  {c.actionLabel}
                </button>
              </li>
            ))}
          </ul>
          {!scan && (
            <button
              type="button"
              className="hud-button mt-3 w-full py-2"
              onClick={runScan}
              disabled={scanning}
            >
              <Trash2 size={13} strokeWidth={1.5} /> Find space to free up
            </button>
          )}
          <p className="micro-label mt-3 normal-case leading-relaxed">
            ARC opens the right place; it never deletes files on its own.
          </p>
        </Panel>
      }
    />
  );
}
