import { useSettingsStore } from '@renderer/stores/settingsStore';
import { THEMES } from '@renderer/themes/themes';
import type { ThemeId } from '@shared/types';

const SHORT: Record<ThemeId, string> = {
  'arc-cyan': 'Cyan',
  'solar-gold': 'Gold',
  crimson: 'Crimson',
  sentinel: 'Sentinel',
  violet: 'Violet',
  mono: 'Mono',
};

export function Palette() {
  const { settings, update } = useSettingsStore();
  return (
    <div
      className="no-drag flex items-center gap-1.5"
      role="radiogroup"
      aria-label="Colour palette"
    >
      <span className="micro-label mr-1 hidden wide:inline">Palette</span>
      {(Object.keys(THEMES) as ThemeId[]).map((id) => {
        const active = settings.theme === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={THEMES[id].name}
            title={THEMES[id].name}
            onClick={() => void update({ theme: id })}
            className={`flex h-6 items-center gap-1.5 rounded-[5px] border px-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-[color,border-color,box-shadow] duration-150 ${
              active
                ? 'border-accent bg-accent/10 text-ice shadow-glow-sm'
                : 'border-line/60 text-text-muted hover:border-accent hover:text-accent'
            }`}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: THEMES[id].colors.accent }}
            />
            <span className="hidden wide:inline">{SHORT[id]}</span>
          </button>
        );
      })}
    </div>
  );
}
