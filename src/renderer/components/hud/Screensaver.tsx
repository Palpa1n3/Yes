import { useEffect, useState } from 'react';
import { describeShift, upcomingShifts, type Shift } from '@shared/shifts';
import { describeWeather, tempSymbol } from '@shared/weather';
import { CoreDisplay } from '@renderer/components/core/CoreDisplay';
import { useClock } from '@renderer/hooks/useClock';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useWeatherStore } from '@renderer/stores/weatherStore';

/** Main → "show/hide the screensaver" (detail: boolean). */
export const SCREENSAVER_EVENT = 'arc:screensaver';

/** Shown full-screen while the PC is idle: a big clock, the weather, your next shift and the
 *  avatar slowly turning. Any key or mouse movement closes it. */
export function Screensaver({ onClose }: { onClose(): void }) {
  const now = useClock(1000);
  const theme = useSettingsStore((s) => s.settings.theme);
  const weather = useWeatherStore((s) => s.data);
  const [shifts, setShifts] = useState<Shift[]>([]);

  useEffect(() => {
    void window.arc.notes.shifts().then(setShifts);
    const close = (): void => onClose();
    // A short delay so the movement that woke the PC doesn't count twice.
    const t = setTimeout(() => {
      window.addEventListener('mousemove', close, { once: true });
      window.addEventListener('keydown', close, { once: true });
      window.addEventListener('mousedown', close, { once: true });
    }, 1500);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousemove', close);
      window.removeEventListener('keydown', close);
      window.removeEventListener('mousedown', close);
    };
  }, [onClose]);

  const next = upcomingShifts(shifts)[0];
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-void"
      role="dialog"
      aria-label="Screensaver"
    >
      <div className="pointer-events-none absolute inset-0 opacity-35">
        <CoreDisplay
          state="idle"
          getLevel={() => 0}
          themeKey={theme}
          label=""
          value={0}
          unit=""
          sub=""
          ringText=""
          compact
        />
      </div>
      <div className="relative text-center">
        <div className="numeric font-display text-[120px] font-light leading-none text-ice text-glow-md">
          {time}
        </div>
        <div className="mt-2 font-mono text-[16px] uppercase tracking-[0.3em] text-text-muted">
          {date}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-8 text-[18px] text-ice">
          {weather && (
            <span>
              {Math.round(weather.current.temp)}
              {tempSymbol(weather.units.temp)} · {describeWeather(weather.current.code).label}
              <span className="text-text-muted"> · {weather.place.name}</span>
            </span>
          )}
          {next && (
            <span>
              <span className="text-text-muted">Next shift </span>
              {describeShift(next).replace(/ \(.*\)$/, '')} · {next.title}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
