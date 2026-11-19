import { Target, X } from 'lucide-react';
import { useState } from 'react';
import { Chip } from './Chip';
import { Panel } from './Panel';
import { useNotesStore } from '@renderer/stores/notesStore';

/** Long-term goals with progress bars. Ask Alton "I've done X for my goal" to move them. */
export function GoalsPanel({ className = '' }: { className?: string }) {
  const { goals, apply } = useNotesStore();
  const [title, setTitle] = useState('');
  const open = goals.filter((g) => !g.done).length;
  return (
    <Panel
      code="NTS.05"
      title="Goals"
      chip={<Chip tone="muted">{open}</Chip>}
      className={className}
      bodyClassName="flex min-h-0 flex-col gap-2 !py-2"
    >
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) void apply({ op: 'addGoal', title: title.trim() });
          setTitle('');
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Run a 5k by March"
          aria-label="Add goal"
          className="h-7 min-w-0 flex-1 rounded-[5px] border border-line bg-panel-raised/70 px-2 text-[12px] text-text-primary placeholder:text-text-muted/70 focus:border-accent focus:outline-none"
        />
        <button type="submit" className="hud-button">
          Add
        </button>
      </form>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto" aria-label="Goals">
        {goals.map((g) => (
          <li key={g.id} className="group text-[12px]">
            <div className="flex items-center gap-2">
              <Target size={12} className={g.done ? 'text-ok' : 'text-accent/80'} />
              <span
                className={`min-w-0 flex-1 truncate ${g.done ? 'text-text-muted line-through' : 'text-text-primary'}`}
              >
                {g.title}
              </span>
              <span className="font-mono text-[10px] text-text-muted">{g.progress}%</span>
              <button
                type="button"
                aria-label={`Remove goal ${g.title}`}
                onClick={() => void apply({ op: 'removeGoal', id: g.id })}
                className="text-text-muted opacity-0 hover:text-alert focus:opacity-100 group-hover:opacity-100"
              >
                <X size={12} />
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={g.progress}
              aria-label={`Progress for ${g.title}`}
              onChange={(e) =>
                void apply({ op: 'goalProgress', id: g.id, progress: Number(e.target.value) })
              }
              className="hud-range w-full"
            />
            {g.log.length > 0 && (
              <p
                className="truncate font-mono text-[10px] text-text-muted"
                title={g.log.at(-1)?.text}
              >
                Last: {g.log.at(-1)?.text}
              </p>
            )}
          </li>
        ))}
        {!goals.length && (
          <li className="text-[12px] text-text-muted">
            Add a goal, or tell Alton “my goal is to …”. It tracks progress, mentions it in the
            morning briefing and nudges you if a goal stalls.
          </li>
        )}
      </ul>
    </Panel>
  );
}
