import { Download } from 'lucide-react';
import { useUpdatesStore } from '@renderer/stores/updatesStore';

/** "Update ready" in the top bar once a new version has downloaded. */
export function UpdateChip() {
  const { status, version } = useUpdatesStore();
  if (status !== 'ready') return null;
  return (
    <button
      type="button"
      onClick={() => void window.arc.updates.install()}
      title={`Version ${version ?? ''} is downloaded. Click to restart and install it (or it installs next time ARC starts).`}
      className="no-drag flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap border border-ok bg-ok/10 px-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ok"
    >
      <Download size={13} strokeWidth={1.5} /> Update ready
    </button>
  );
}
