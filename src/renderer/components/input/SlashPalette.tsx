import type { SlashCommand } from './slashCommands';

interface Props {
  items: SlashCommand[];
  /** A line above the list (e.g. the copied text the prompts will use). */
  heading?: string;
  active: number;
  onPick(cmd: SlashCommand): void;
  onHover(i: number): void;
}

export function SlashPalette({ items, active, onPick, onHover, heading }: Props) {
  return (
    <ul
      id="slash-palette"
      role="listbox"
      aria-label="Commands"
      className="absolute bottom-full left-0 right-0 z-20 mb-1 border border-accent/60 bg-void/95 py-1 shadow-glow-sm"
    >
      {heading && (
        <li
          role="presentation"
          className="truncate border-b border-line/50 px-3 pb-1 text-[11px] text-text-muted"
        >
          {heading}
        </li>
      )}
      {items.map((c, i) => (
        <li
          key={c.name}
          id={`slash-${i}`}
          role="option"
          aria-selected={i === active}
          onMouseDown={(e) => {
            e.preventDefault(); // keep focus in the input
            onPick(c);
          }}
          onMouseEnter={() => onHover(i)}
          className={`flex cursor-pointer items-baseline gap-3 px-3 py-1 ${i === active ? 'bg-accent/10 text-accent' : 'text-text-primary'}`}
        >
          <span className={`font-mono text-[12px] ${c.prompt ? 'text-ice' : ''}`}>{c.name}</span>
          <span className="text-[12px] text-text-muted">{c.hint}</span>
        </li>
      ))}
    </ul>
  );
}
