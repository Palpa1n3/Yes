import { useEffect, useState } from 'react';
import { describeShift, upcomingShifts, type Shift } from '@shared/shifts';
import type { SystemStats } from '@shared/types';
import { describeWeather, tempSymbol, type WeatherData } from '@shared/weather';
import { useClock } from '@renderer/hooks/useClock';

/** The desktop widget (its own small see-through window): time, CPU, next shift and weather.
 *  Shown even when Alton is closed to the tray; clicks pass through to the desktop. */
export function DesktopWidget() {
  const now = useClock(1000);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    const load = (): void => {
      void window.arc.system.getStats().then(setStats);
      void window.arc.weather.get().then((w) => setWeather(w.data));
      void window.arc.notes.shifts().then(setShifts);
    };
    load();
    const fast = setInterval(() => void window.arc.system.getStats().then(setStats), 3000);
    const slow = setInterval(load, 5 * 60_000);
    return () => {
      clearInterval(fast);
      clearInterval(slow);
    };
  }, []);

  const next = upcomingShifts(shifts)[0];
  const cpu = stats?.timestamp ? Math.round(stats.cpu.load) : null;
  return (
    <div className="m-2 select-none rounded-[10px] border border-accent/45 bg-void/70 px-4 py-3 text-ice shadow-glow-sm backdrop-blur-[2px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="numeric font-display text-[34px] font-light leading-none text-glow-md">
          {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        {cpu !== null && (
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
            CPU <span className="text-accent">{cpu}%</span>
          </span>
        )}
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
        {now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
        {weather &&
          ` · ${Math.round(weather.current.temp)}${tempSymbol(weather.units.temp)} ${describeWeather(weather.current.code).label}`}
      </div>
      {next && (
        <div className="mt-1.5 truncate text-[12px]">
          <span className="text-text-muted">Next shift </span>
          {describeShift(next).replace(/ \(.*\)$/, '')}
        </div>
      )}
    </div>
  );
}
