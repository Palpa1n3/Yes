import { Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { toCommand } from '@shared/commands';
import { useMediaStore } from '@renderer/stores/mediaStore';
import { Chip } from './Chip';
import { Panel } from './Panel';

const press = (target: 'play_pause' | 'next' | 'previous'): void =>
  void window.arc.commands
    .execute(toCommand({ action: 'media_control', target }, `media-${Date.now()}`))
    .catch(() => undefined);

/** What's playing in Spotify / a browser / any media app, with transport buttons.
 *  Hidden when nothing is playing. */
export function NowPlayingPanel({ className = '' }: { className?: string }) {
  const now = useMediaStore((s) => s.now);
  if (!now) return null;
  const btn =
    'grid h-8 w-8 place-items-center border border-line/70 text-text-muted transition-colors hover:border-accent hover:text-accent';
  return (
    <Panel
      code="AUD.04"
      title="Now playing"
      chip={<Chip tone={now.playing ? 'accent' : 'muted'}>{now.playing ? now.app : 'Paused'}</Chip>}
      className={className}
      bodyClassName="flex items-center gap-3 !py-2.5"
    >
      <div
        className={`grid h-11 w-11 shrink-0 place-items-center border border-accent/40 bg-accent/[0.06] ${now.playing ? 'text-accent' : 'text-text-muted'}`}
      >
        <Music2 size={20} strokeWidth={1.5} className={now.playing ? 'animate-pulse' : ''} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-ice" title={now.title}>
          {now.title}
        </div>
        <div
          className="truncate text-[11px] text-text-muted"
          title={[now.artist, now.album].filter(Boolean).join(' · ')}
        >
          {now.artist || now.app}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          className={btn}
          aria-label="Previous track"
          onClick={() => press('previous')}
        >
          <SkipBack size={13} />
        </button>
        <button
          type="button"
          className={`${btn} !text-accent`}
          aria-label={now.playing ? 'Pause' : 'Play'}
          onClick={() => press('play_pause')}
        >
          {now.playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button type="button" className={btn} aria-label="Next track" onClick={() => press('next')}>
          <SkipForward size={13} />
        </button>
      </div>
    </Panel>
  );
}
