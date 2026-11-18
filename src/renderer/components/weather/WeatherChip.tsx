import { describeWeather, tempSymbol } from '@shared/weather';
import { useUiStore } from '@renderer/stores/uiStore';
import { useWeatherStore } from '@renderer/stores/weatherStore';
import { WeatherIcon } from './WeatherIcon';

/** "☁ 9°" beside the clock; hidden until a town is set and a reading exists. */
export function WeatherChip() {
  const data = useWeatherStore((s) => s.data);
  if (!data) return null;
  const label = describeWeather(data.current.code, data.current.isDay).label;
  const temp = `${Math.round(data.current.temp)}${tempSymbol(data.units.temp)}`;
  return (
    <button
      type="button"
      onClick={() => useUiStore.getState().setTab('overview')}
      title={`${data.place.name}: ${label}, ${temp}`}
      aria-label={`Weather in ${data.place.name}: ${label}, ${temp}`}
      className="no-drag flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap border border-line/70 px-2 font-mono text-[12px] tabular-nums text-ice transition-colors hover:border-accent"
    >
      <WeatherIcon code={data.current.code} isDay={data.current.isDay} size={13} />
      {Math.round(data.current.temp)}°
    </button>
  );
}
