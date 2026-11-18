import { Search } from 'lucide-react';
import { useState } from 'react';
import { placeLabel, type WeatherPlace } from '@shared/weather';
import { useSettingsStore } from '@renderer/stores/settingsStore';

/** Town search → pick a result → saved as settings.weatherPlace (only its coordinates leave the PC). */
export function PlaceSearch({
  onPicked,
  compact = false,
}: {
  onPicked?(): void;
  compact?: boolean;
}) {
  const update = useSettingsStore((s) => s.update);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<WeatherPlace[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const search = async (): Promise<void> => {
    if (q.trim().length < 2) return;
    setBusy(true);
    setError('');
    try {
      const r = await window.arc.weather.search(q.trim());
      setResults(r);
      if (!r.length) setError('No places found. Try the town name only.');
    } catch {
      setResults(null);
      setError("Couldn't reach the weather service. Check your internet connection.");
    } finally {
      setBusy(false);
    }
  };

  const pick = (p: WeatherPlace): void => {
    void update({ weatherPlace: p });
    setResults(null);
    setQ('');
    onPicked?.();
  };

  return (
    <div className="flex w-full flex-col gap-1.5">
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Town or city"
          placeholder="Town or city"
          maxLength={80}
          spellCheck={false}
          className={`${compact ? 'h-7' : 'h-8'} min-w-0 flex-1 border border-line bg-panel-raised/80 px-2 font-mono text-[12px] text-text-primary placeholder:text-text-muted/70 focus:border-accent focus:outline-none`}
        />
        <button
          type="submit"
          className="hud-button flex items-center gap-1"
          disabled={busy || q.trim().length < 2}
        >
          <Search size={12} strokeWidth={1.5} />
          {busy ? '…' : 'Find'}
        </button>
      </form>
      {error && <p className="text-[11px] text-amber">{error}</p>}
      {results && results.length > 0 && (
        <ul className="max-h-36 overflow-y-auto border border-line/60" aria-label="Places found">
          {results.map((p) => (
            <li key={`${p.lat},${p.lon}`}>
              <button
                type="button"
                onClick={() => pick(p)}
                className="hud-row w-full truncate px-2 py-1 text-left text-[12px] hover:text-accent"
              >
                {placeLabel(p)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
