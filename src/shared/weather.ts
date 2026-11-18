/** Weather types and pure helpers shared by main (fetch/parse) and renderer (display).
 *  Data: Open-Meteo (open-meteo.com), free, no API key. */

export interface WeatherPlace {
  name: string;
  region?: string;
  country?: string;
  lat: number;
  lon: number;
}

export type TempUnit = 'c' | 'f';
export type WindUnit = 'mph' | 'kmh';

export interface HourForecast {
  /** Local time at the place, ISO without offset ("2026-11-18T17:00"). */
  time: string;
  hour: number;
  temp: number;
  code: number;
  rainChance: number | null;
}

export interface WeatherData {
  place: WeatherPlace;
  units: { temp: TempUnit; wind: WindUnit };
  fetchedAt: number;
  current: {
    temp: number;
    feels: number;
    humidity: number;
    code: number;
    isDay: boolean;
    windSpeed: number;
    windDir: number;
    precipitation: number;
  };
  hourly: HourForecast[];
  today: {
    max: number;
    min: number;
    rainChance: number | null;
    sunrise: string | null;
    sunset: string | null;
  };
  tomorrow: { max: number; min: number; code: number; rainChance: number | null } | null;
}

/** WMO weather interpretation codes → label + icon name (lucide). */
export function describeWeather(code: number, isDay = true): { label: string; icon: string } {
  if (code === 0) return { label: isDay ? 'Clear' : 'Clear night', icon: isDay ? 'Sun' : 'Moon' };
  if (code === 1) return { label: 'Mostly clear', icon: isDay ? 'CloudSun' : 'CloudMoon' };
  if (code === 2) return { label: 'Partly cloudy', icon: isDay ? 'CloudSun' : 'CloudMoon' };
  if (code === 3) return { label: 'Overcast', icon: 'Cloud' };
  if (code === 45 || code === 48) return { label: 'Fog', icon: 'CloudFog' };
  if (code >= 51 && code <= 57)
    return { label: code >= 56 ? 'Freezing drizzle' : 'Drizzle', icon: 'CloudDrizzle' };
  if (code >= 61 && code <= 67)
    return {
      label:
        code >= 66
          ? 'Freezing rain'
          : code === 65
            ? 'Heavy rain'
            : code === 61
              ? 'Light rain'
              : 'Rain',
      icon: 'CloudRain',
    };
  if (code >= 71 && code <= 77)
    return {
      label: code === 75 ? 'Heavy snow' : code === 77 ? 'Snow grains' : 'Snow',
      icon: 'CloudSnow',
    };
  if (code >= 80 && code <= 82)
    return { label: code === 82 ? 'Violent showers' : 'Rain showers', icon: 'CloudRain' };
  if (code === 85 || code === 86) return { label: 'Snow showers', icon: 'CloudSnow' };
  if (code === 95) return { label: 'Thunderstorm', icon: 'CloudLightning' };
  if (code === 96 || code === 99)
    return { label: 'Thunderstorm with hail', icon: 'CloudLightning' };
  return { label: 'Unknown', icon: 'Cloud' };
}

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass = (deg: number): string =>
  DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8] ?? 'N';

export const placeLabel = (p: WeatherPlace): string =>
  [p.name, p.region && p.region !== p.name ? p.region : '', p.country].filter(Boolean).join(', ');

export const tempSymbol = (u: TempUnit): string => (u === 'f' ? '°F' : '°C');
export const windSymbol = (u: WindUnit): string => (u === 'mph' ? 'mph' : 'km/h');

/** Compact, model-friendly summary (the get_weather tool result). */
export function weatherSummary(d: WeatherData, now = Date.now()): Record<string, unknown> {
  const T = tempSymbol(d.units.temp);
  const W = windSymbol(d.units.wind);
  return {
    place: placeLabel(d.place),
    readingAgeMinutes: Math.max(0, Math.round((now - d.fetchedAt) / 60000)),
    now: {
      conditions: describeWeather(d.current.code, d.current.isDay).label,
      temp: `${Math.round(d.current.temp)}${T}`,
      feelsLike: `${Math.round(d.current.feels)}${T}`,
      humidity: `${Math.round(d.current.humidity)}%`,
      wind: `${Math.round(d.current.windSpeed)} ${W} from ${compass(d.current.windDir)}`,
      precipitationMm: d.current.precipitation,
    },
    today: {
      high: `${Math.round(d.today.max)}${T}`,
      low: `${Math.round(d.today.min)}${T}`,
      rainChance: d.today.rainChance === null ? 'unknown' : `${d.today.rainChance}%`,
      sunrise: d.today.sunrise?.slice(11, 16) ?? null,
      sunset: d.today.sunset?.slice(11, 16) ?? null,
    },
    nextHours: d.hourly.map((h) => ({
      time: h.time.slice(11, 16),
      temp: `${Math.round(h.temp)}${T}`,
      conditions: describeWeather(h.code).label,
      rainChance: h.rainChance === null ? 'unknown' : `${h.rainChance}%`,
    })),
    tomorrow: d.tomorrow && {
      conditions: describeWeather(d.tomorrow.code).label,
      high: `${Math.round(d.tomorrow.max)}${T}`,
      low: `${Math.round(d.tomorrow.min)}${T}`,
      rainChance: d.tomorrow.rainChance === null ? 'unknown' : `${d.tomorrow.rainChance}%`,
    },
  };
}

/** Highest rain chance over the coming hours (null when unknown). */
export function rainSoon(d: WeatherData): number | null {
  const v = d.hourly.map((h) => h.rainChance).filter((x): x is number => x !== null);
  return v.length ? Math.max(...v) : d.today.rainChance;
}
