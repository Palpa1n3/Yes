/** Weather from Open-Meteo: place search (geocoding) and forecast. Fetches run in main
 *  (Electron's net.fetch, which honours system proxy settings), are cached to disk so the
 *  last reading shows offline, and refresh every 15 minutes while ARC is visible. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { HourForecast, TempUnit, WeatherData, WeatherPlace, WindUnit } from '@shared/weather';

export const REFRESH_MS = 15 * 60_000;
type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function forecastUrl(p: WeatherPlace, temp: TempUnit, wind: WindUnit): string {
  const q = new URLSearchParams({
    latitude: p.lat.toFixed(4),
    longitude: p.lon.toFixed(4),
    current:
      'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day,precipitation',
    hourly: 'temperature_2m,weather_code,precipitation_probability',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    timezone: 'auto',
    forecast_days: '2',
    temperature_unit: temp === 'f' ? 'fahrenheit' : 'celsius',
    wind_speed_unit: wind,
  });
  return `https://api.open-meteo.com/v1/forecast?${q.toString()}`;
}

export const geocodeUrl = (query: string): string =>
  `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: query, count: '6', language: 'en', format: 'json' }).toString()}`;

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const arr = (o: Record<string, unknown> | undefined, k: string): unknown[] =>
  o && Array.isArray(o[k]) ? (o[k] as unknown[]) : [];

export function parseForecast(
  json: unknown,
  place: WeatherPlace,
  units: WeatherData['units'],
  fetchedAt: number,
): WeatherData {
  const j = (json ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const c = j['current'];
  if (!c || typeof c['temperature_2m'] !== 'number')
    throw new Error('The weather service sent an unexpected response.');
  const h = j['hourly'];
  const d = j['daily'];
  const times = arr(h, 'time') as string[];
  // Next hours from the current local hour (ISO strings compare correctly).
  const nowHour = String(c['time'] ?? '').slice(0, 13);
  const start = Math.max(
    0,
    times.findIndex((t) => t.slice(0, 13) >= nowHour),
  );
  const hourly: HourForecast[] = times.slice(start, start + 8).map((t, i) => ({
    time: t,
    hour: Number(t.slice(11, 13)),
    temp: num(arr(h, 'temperature_2m')[start + i]),
    code: num(arr(h, 'weather_code')[start + i]),
    rainChance:
      typeof arr(h, 'precipitation_probability')[start + i] === 'number'
        ? (arr(h, 'precipitation_probability')[start + i] as number)
        : null,
  }));
  const day = (k: string, i: number): unknown => arr(d, k)[i];
  const rain = (i: number): number | null =>
    typeof day('precipitation_probability_max', i) === 'number'
      ? (day('precipitation_probability_max', i) as number)
      : null;
  return {
    place,
    units,
    fetchedAt,
    current: {
      temp: num(c['temperature_2m']),
      feels: num(c['apparent_temperature'], num(c['temperature_2m'])),
      humidity: num(c['relative_humidity_2m']),
      code: num(c['weather_code']),
      isDay: c['is_day'] !== 0,
      windSpeed: num(c['wind_speed_10m']),
      windDir: num(c['wind_direction_10m']),
      precipitation: num(c['precipitation']),
    },
    hourly,
    today: {
      max: num(day('temperature_2m_max', 0)),
      min: num(day('temperature_2m_min', 0)),
      rainChance: rain(0),
      sunrise: typeof day('sunrise', 0) === 'string' ? (day('sunrise', 0) as string) : null,
      sunset: typeof day('sunset', 0) === 'string' ? (day('sunset', 0) as string) : null,
    },
    tomorrow:
      arr(d, 'time').length > 1
        ? {
            max: num(day('temperature_2m_max', 1)),
            min: num(day('temperature_2m_min', 1)),
            code: num(day('weather_code', 1)),
            rainChance: rain(1),
          }
        : null,
  };
}

export function parsePlaces(json: unknown): WeatherPlace[] {
  const results = (json as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  return results
    .filter(
      (r): r is Record<string, unknown> =>
        !!r && typeof r === 'object' && typeof (r as Record<string, unknown>)['name'] === 'string',
    )
    .filter((r) => typeof r['latitude'] === 'number' && typeof r['longitude'] === 'number')
    .map((r) => ({
      name: r['name'] as string,
      region: typeof r['admin1'] === 'string' ? (r['admin1'] as string) : undefined,
      country: typeof r['country'] === 'string' ? (r['country'] as string) : undefined,
      lat: r['latitude'] as number,
      lon: r['longitude'] as number,
    }));
}

export interface WeatherServiceDeps {
  fetch: Fetch;
  file?: string;
  config(): { place: WeatherPlace | null; temp: TempUnit; wind: WindUnit };
  onChange(data: WeatherData | null, error: string | null): void;
  now?: () => number;
}

export class WeatherService {
  private data: WeatherData | null = null;
  private error: string | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private inflight: Promise<void> | null = null;
  private readonly now: () => number;

  constructor(private readonly d: WeatherServiceDeps) {
    this.now = d.now ?? Date.now;
    try {
      if (d.file && existsSync(d.file))
        this.data = JSON.parse(readFileSync(d.file, 'utf8')) as WeatherData;
    } catch {
      this.data = null;
    }
  }

  get(): { data: WeatherData | null; error: string | null } {
    const c = this.d.config();
    // A cached reading for a different place or units is not shown.
    const fits =
      this.data &&
      c.place &&
      this.data.place.lat === c.place.lat &&
      this.data.place.lon === c.place.lon &&
      this.data.units.temp === c.temp &&
      this.data.units.wind === c.wind;
    return { data: fits ? this.data : null, error: this.error };
  }

  /** Refresh if stale (or forced). Never throws; errors are reported via onChange. */
  refresh(force = false): Promise<void> {
    const { place, temp, wind } = this.d.config();
    if (!place) {
      this.data = null;
      this.error = null;
      this.d.onChange(null, null);
      return Promise.resolve();
    }
    const current = this.get().data;
    if (!force && current && this.now() - current.fetchedAt < REFRESH_MS - 30_000)
      return Promise.resolve();
    this.inflight ??= (async () => {
      try {
        const res = await this.d.fetch(forecastUrl(place, temp, wind));
        if (!res.ok) throw new Error(`The weather service returned an error (${res.status}).`);
        this.data = parseForecast(await res.json(), place, { temp, wind }, this.now());
        this.error = null;
        this.save();
      } catch (err) {
        this.error =
          err instanceof Error && err.message.startsWith('The weather')
            ? err.message
            : this.get().data
              ? "Couldn't reach the weather service; showing the last reading."
              : "Couldn't reach the weather service. Check your internet connection.";
      } finally {
        this.inflight = null;
        this.d.onChange(this.get().data, this.error);
      }
    })();
    return this.inflight;
  }

  async search(query: string): Promise<WeatherPlace[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const res = await this.d.fetch(geocodeUrl(q.slice(0, 80)));
    if (!res.ok) throw new Error(`Place search failed (${res.status}).`);
    return parsePlaces(await res.json());
  }

  /** Poll while the window is visible. */
  start(): void {
    void this.refresh();
    this.timer ??= setInterval(() => void this.refresh(), REFRESH_MS);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private save(): void {
    if (!this.d.file || !this.data) return;
    try {
      mkdirSync(dirname(this.d.file), { recursive: true });
      const tmp = `${this.d.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.data));
      renameSync(tmp, this.d.file);
    } catch {
      /* non-fatal */
    }
  }
}
