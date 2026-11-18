import {
  Check,
  ExternalLink,
  HardDriveDownload,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CleanupId, CleanupResult, CleanupScan } from '@shared/cleanup';
import { fmtBytes } from '@renderer/lib/format';
import { useSystemStore } from '@renderer/stores/systemStore';
import { Chip } from './Chip';
import { Panel } from './Panel';

/** Survives switching tabs (a scan takes a few seconds). */
let lastScan: CleanupScan | null = null;

const box = (on: boolean): string =>
  `grid h-4 w-4 shrink-0 place-items-center border ${on ? 'border-accent bg-accent/20 text-accent' : 'border-line'}`;

/** Free up space: size the safe places, tick, confirm, clear. */
export function CleanupPanel() {
  const isWindows = useSystemStore((s) => s.info?.platform === 'win32');
  const fullest = useSystemStore(
    (s) => [...(s.stats?.disks ?? [])].sort((a, b) => b.used / b.size - a.used / a.size)[0],
  );
  const [scan, setScan] = useState<CleanupScan | null>(lastScan);
  const [busy, setBusy] = useState<'scan' | 'clean' | null>(null);
  const [picked, setPicked] = useState<Set<CleanupId>>(
    () => new Set(lastScan?.items.filter((i) => i.recommended && i.bytes > 0).map((i) => i.id)),
  );
  const [files, setFiles] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<CleanupResult | null>(null);

  const runScan = (): void => {
    setBusy('scan');
    setResult(null);
    void window.arc.cleanup
      .scan()
      .then((s) => {
        lastScan = s;
        setScan(s);
        setPicked(new Set(s.items.filter((i) => i.recommended && i.bytes > 0).map((i) => i.id)));
        setFiles(new Set());
      })
      .finally(() => setBusy(null));
  };

  const total = useMemo(
    () =>
      (scan?.items ?? []).filter((i) => picked.has(i.id)).reduce((n, i) => n + i.bytes, 0) +
      (scan?.downloads ?? []).filter((f) => files.has(f.name)).reduce((n, f) => n + f.size, 0),
    [scan, picked, files],
  );

  const clean = (): void => {
    setConfirm(false);
    setBusy('clean');
    void window.arc.cleanup
      .run([...picked], [...files])
      .then((r) => {
        setResult(r);
        lastScan = null;
        setScan(null);
      })
      .finally(() => setBusy(null));
  };

  const full = fullest ? Math.round((fullest.used / fullest.size) * 100) : 0;
  return (
    <Panel
      code="CLN.04"
      title="Free up space"
      chip={
        full >= 85 ? (
          <Chip tone="amber">
            {fullest?.mount} {full}%
          </Chip>
        ) : (
          <Chip tone="muted">Safe</Chip>
        )
      }
      className="flex-1"
      bodyClassName="flex min-h-0 flex-col gap-2 overflow-y-auto"
    >
      {result && (
        <p
          className="flex items-start gap-1.5 border border-ok/50 bg-ok/5 px-2 py-1.5 text-[12px] text-ok"
          role="status"
        >
          <Sparkles size={13} className="mt-0.5 shrink-0" />
          <span>
            Freed {fmtBytes(result.freed)}. {result.skipped ? result.message : ''}
          </span>
        </p>
      )}
      {!scan ? (
        <>
          <p className="text-[12px] text-text-muted">
            Checks temporary files, the Recycle Bin, crash reports, browser and game launcher
            caches, and big or old downloads. Nothing is removed until you choose.
          </p>
          <button
            type="button"
            className="hud-button w-full justify-center py-2"
            onClick={runScan}
            disabled={busy !== null}
          >
            <Trash2 size={13} strokeWidth={1.5} />{' '}
            {busy === 'scan' ? 'Checking… (a few seconds)' : 'Find space to free up'}
          </button>
        </>
      ) : (
        <>
          <ul aria-label="What can be cleared">
            {scan.items.map((i) => {
              const on = picked.has(i.id);
              return (
                <li key={i.id} className="border-b border-line/30 py-1.5 last:border-0">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    disabled={i.bytes === 0}
                    onClick={() =>
                      setPicked((p) => {
                        const n = new Set(p);
                        if (on) n.delete(i.id);
                        else n.add(i.id);
                        return n;
                      })
                    }
                    className="flex w-full items-start gap-2 text-left disabled:opacity-40"
                  >
                    <span className={`${box(on)} mt-0.5`}>{on && <Check size={11} />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2 text-[13px] text-text-primary">
                        {i.label}
                        <span className="numeric text-[12px] text-amber">
                          {i.bytes ? fmtBytes(i.bytes) : '—'}
                        </span>
                      </span>
                      <span className="block text-[11px] leading-snug text-text-muted">
                        {i.detail}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {scan.downloads.length > 0 && (
            <details className="border-t border-line/40 pt-1.5">
              <summary className="cursor-pointer text-[12px] text-text-primary">
                <HardDriveDownload size={12} className="mr-1 inline text-accent" /> Big or old
                downloads ({scan.downloads.length}) · go to the Recycle Bin
              </summary>
              <ul className="mt-1 max-h-44 overflow-y-auto">
                {scan.downloads.map((f) => {
                  const on = files.has(f.name);
                  return (
                    <li key={f.name}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() =>
                          setFiles((p) => {
                            const n = new Set(p);
                            if (on) n.delete(f.name);
                            else n.add(f.name);
                            return n;
                          })
                        }
                        title={`Last changed ${new Date(f.modified).toLocaleDateString()}`}
                        className="flex w-full items-center gap-2 py-1 text-left text-[12px]"
                      >
                        <span className={box(on)}>{on && <Check size={11} />}</span>
                        <span className="min-w-0 flex-1 truncate">{f.name}</span>
                        <span className="numeric text-text-muted">{fmtBytes(f.size)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
          {confirm ? (
            <div
              className="border border-amber/60 bg-amber/5 p-2 text-[12px]"
              role="alertdialog"
              aria-label="Confirm clean-up"
            >
              <p className="text-amber">
                Clear {fmtBytes(total)}? Caches and temp files are deleted for good
                {files.size ? '; chosen downloads go to the Recycle Bin' : ''}.
              </p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="hud-button !text-alert" onClick={clean}>
                  Yes, clear it
                </button>
                <button type="button" className="hud-button" onClick={() => setConfirm(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                className="hud-button flex-1 justify-center py-2"
                disabled={!total || busy !== null}
                onClick={() => setConfirm(true)}
              >
                <Trash2 size={13} strokeWidth={1.5} />{' '}
                {busy === 'clean' ? 'Clearing…' : `Clear ${fmtBytes(total)}`}
              </button>
              <button
                type="button"
                className="hud-button"
                onClick={runScan}
                disabled={busy !== null}
              >
                Rescan
              </button>
            </div>
          )}
        </>
      )}
      {isWindows && (
        <button
          type="button"
          className="hud-button justify-center"
          onClick={() => window.arc.cleanup.openWindowsTool()}
          title="Windows Update leftovers and other system files need administrator rights"
        >
          <ExternalLink size={12} /> Windows Disk Cleanup (system files)
        </button>
      )}
      <p className="mt-auto flex items-start gap-1.5 text-[11px] leading-snug text-text-muted">
        <ShieldCheck size={12} className="mt-px shrink-0 text-ok" />
        Only clears these known-safe places, only after you confirm. Your documents, photos and
        passwords are never touched.
      </p>
    </Panel>
  );
}
