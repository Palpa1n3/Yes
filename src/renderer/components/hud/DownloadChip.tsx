import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IDLE_DOWNLOAD, type DownloadStatus } from '@shared/gaming';
import { fmtBytes } from '@renderer/lib/format';
import { useSystemStore } from '@renderer/stores/systemStore';

/** "⬇ Download 45% · 32 MB/s" in the top bar while download mode is on; click to end it. */
export function DownloadChip() {
  const [st, setSt] = useState<DownloadStatus>(IDLE_DOWNLOAD);
  const down = useSystemStore((s) => s.stats?.network.down ?? 0);

  useEffect(() => {
    void window.arc.gaming.downloadStatus().then(setSt);
    return window.arc.gaming.onDownload(setSt);
  }, []);

  if (!st.active) return null;
  const first = st.games[0];
  const pct = first?.progress.match(/^\d+%/)?.[0];
  const tip = [
    'Download mode',
    ...st.games.map((g) => `${g.name}: ${g.progress}`),
    ...st.notes,
    st.then !== 'none' ? `Then: ${st.then === 'sleep' ? 'sleep' : 'shut down'} the PC` : '',
    'Click to end it now',
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <button
      type="button"
      onClick={() => {
        if (confirm('End download mode? Paused apps will be reopened.'))
          void window.arc.gaming.download(false).then((r) => 'active' in r && setSt(r));
      }}
      title={tip}
      aria-label={`Download mode on${pct ? `, ${pct}` : ''}. End download mode`}
      className="no-drag flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap border border-accent bg-accent/10 px-2 font-mono text-[11px] uppercase tracking-[0.12em] text-accent"
    >
      <Download size={13} strokeWidth={1.5} />
      Download{pct ? ` ${pct}` : ''}
      <span className="normal-case tracking-normal text-ice">· {fmtBytes(down)}/s</span>
    </button>
  );
}
