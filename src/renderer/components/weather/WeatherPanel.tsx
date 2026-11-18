import { Droplets, RefreshCw, Sunrise, Sunset } from 'lucide-react';
import { compass, describeWeather, rainSoon, tempSymbol, windSymbol } from '@shared/weather';
import { Chip } from '@renderer/components/panels/Chip';
import { Panel } from '@renderer/components/panels/Panel';
import { Stat } from '@renderer/components/panels/Stat';
import { useClock } from '@renderer/hooks/useClock';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useWeatherStore } from '@renderer/stores/weatherStore';
import { PlaceSearch } from './PlaceSearch';
import { WeatherIcon } from './WeatherIcon';

const ago = (ms: number): string => {
  const m = Math.round(ms / 60000);
  return m < 1 ? 'Now' : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
};

/** Live weather for the saved town (Open-Meteo), with an inline town search when none is set. */
export function WeatherPanel({ className = '' }: { className?: string }) {
  const place = useSettingsStore((s) => s.settings.weatherPlace);
  const { data, error, loading, refresh } = useWeatherStore();
  const now = useClock(30_000).getTime();

  if (!place) {
    return (
      <Panel
        code="WX.02"
        title="Weather"
        chip={<Chip tone="muted">Not set</Chip>}
        className={className}
        bodyClassName="flex flex-col gap-2 !py-2"
      >
        <p className="text-[12px] text-text-muted">
          Where are you? Only the town&apos;s map position is sent to the free Open-Meteo service.
        </p>
        <PlaceSearch compact />
      </Panel>
    );
  }

  const T = data ? tempSymbol(data.units.temp) : '°';
  const rain = data ? rainSoon(data) : null;
  return (
    <Panel
      code="WX.02"
      title="Weather"
      chip={
        <span className="flex w-[124px] items-center justify-end gap-1.5">
          {error ? (
            <Chip tone="amber">Offline</Chip>
          ) : (
            <Chip tone="muted">{data ? ago(now - data.fetchedAt) : 'Loading'}</Chip>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            aria-label="Refresh weather"
            title="Refresh"
            className="no-drag text-text-muted hover:text-accent"
          >
            <RefreshCw size={12} strokeWidth={1.5} className={loading ? 'animate-spin' : ''} />
          </button>
        </span>
      }
      className={className}
      bodyClassName="flex flex-col gap-2 !py-2"
    >
      {!data ? (
        <p className="text-[12px] text-text-muted">
          {error ?? `Fetching the forecast for ${place.name}…`}
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <WeatherIcon
              code={data.current.code}
              isDay={data.current.isDay}
              size={38}
              className="shrink-0 text-accent"
            />
            <div className="min-w-0 flex-1">
              <div className="numeric text-[30px] font-extralight leading-none text-ice text-glow">
                {Math.round(data.current.temp)}
                <span className="text-[13px] text-text-muted">{T}</span>
              </div>
              <div className="truncate text-[12px] text-text-primary" title={place.name}>
                {describeWeather(data.current.code, data.current.isDay).label} · {place.name}
              </div>
            </div>
            <div className="text-right font-mono text-[11px] leading-5 text-text-muted">
              <div>
                H <span className="text-ice">{Math.round(data.today.max)}°</span>
              </div>
              <div>
                L <span className="text-ice">{Math.round(data.today.min)}°</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Feels" value={`${Math.round(data.current.feels)}${T}`} />
            <Stat
              label="Wind"
              value={`${Math.round(data.current.windSpeed)} ${windSymbol(data.units.wind)} ${compass(data.current.windDir)}`}
            />
            <Stat
              label="Rain soon"
              value={rain === null ? '—' : `${rain}%`}
              accent={(rain ?? 0) >= 50}
            />
          </div>
          <ol
            className="grid grid-cols-8 gap-0.5 border-t border-line/40 pt-1.5"
            aria-label="Next hours"
          >
            {data.hourly.map((h) => (
              <li
                key={h.time}
                className="flex flex-col items-center gap-0.5"
                title={`${h.time.slice(11, 16)}: ${Math.round(h.temp)}${T}, ${describeWeather(h.code).label}${h.rainChance !== null ? `, ${h.rainChance}% rain` : ''}`}
              >
                <span className="numeric text-[9px] text-text-muted">
                  {String(h.hour).padStart(2, '0')}
                </span>
                <WeatherIcon code={h.code} size={13} className="text-accent/80" />
                <span className="numeric text-[11px] text-ice">{Math.round(h.temp)}°</span>
                <span
                  className={`numeric text-[9px] ${(h.rainChance ?? 0) >= 50 ? 'text-accent' : 'text-text-muted/70'}`}
                >
                  {h.rainChance === null ? '' : `${h.rainChance}%`}
                </span>
              </li>
            ))}
          </ol>
          <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-text-muted">
            <span className="flex items-center gap-1">
              <Droplets size={11} strokeWidth={1.5} />
              {Math.round(data.current.humidity)}%
            </span>
            {data.today.sunrise && (
              <span className="flex items-center gap-1">
                <Sunrise size={11} strokeWidth={1.5} />
                {data.today.sunrise.slice(11, 16)}
              </span>
            )}
            {data.today.sunset && (
              <span className="flex items-center gap-1">
                <Sunset size={11} strokeWidth={1.5} />
                {data.today.sunset.slice(11, 16)}
              </span>
            )}
            {data.tomorrow && (
              <span
                className="flex items-center gap-1"
                title={`Tomorrow: ${describeWeather(data.tomorrow.code).label}`}
              >
                Tmrw
                <WeatherIcon code={data.tomorrow.code} size={11} />
                {Math.round(data.tomorrow.max)}°/{Math.round(data.tomorrow.min)}°
              </span>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}
