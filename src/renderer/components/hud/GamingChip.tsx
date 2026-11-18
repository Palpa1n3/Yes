import { Gamepad2 } from 'lucide-react';
import { useGamingStore } from '@renderer/stores/gamingStore';

/** "🎮 Gaming" in the top bar while gaming mode is on; click to end it. */
export function GamingChip() {
  const { active, game, actions } = useGamingStore();
  if (!active) return null;
  return (
    <button
      type="button"
      onClick={() => void window.arc.gaming.stop().then((s) => useGamingStore.setState(s))}
      title={`Gaming mode${game ? `: ${game}` : ''}${actions.length ? `\n${actions.join('\n')}` : ''}\nClick to end it now`}
      aria-label={`Gaming mode on${game ? ` for ${game}` : ''}. End gaming mode`}
      className="no-drag flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap border border-accent bg-accent/10 px-2 font-mono text-[11px] uppercase tracking-[0.12em] text-accent"
    >
      <Gamepad2 size={13} strokeWidth={1.5} /> Gaming
    </button>
  );
}
