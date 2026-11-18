import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ProviderChunk } from '@shared/types';
import {
  compass,
  describeWeather,
  placeLabel,
  rainSoon,
  weatherSummary,
  type WeatherData,
  type WeatherPlace,
} from '@shared/weather';
import { sanitizeSettings } from '@shared/settings';
import { MockProvider } from '../../src/main/services/ai-provider';
import { toIntent } from '../../src/main/services/anthropic-provider';
import {
  REFRESH_MS,
  WeatherService,
  forecastUrl,
  geocodeUrl,
  parseForecast,
  parsePlaces,
} from '../../src/main/services/weather';

const LEEDS: WeatherPlace = {
  name: 'Leeds',
  region: 'England',
  country: 'United Kingdom',
  lat: 53.79648,
  lon: -1.54785,
};

/** Shaped like Open-Meteo's documented /v1/forecast response. */
function forecastJson() {
  const times = Array.from({ length: 48 }, (_, i) => {
    const day = i < 24 ? '18' : '19';
    return `2026-11-${day}T${String(i % 24).padStart(2, '0')}:00`;
  });
  return {
    latitude: 53.8,
    longitude: -1.55,
    timezone: 'Europe/London',
    current: {
      time: '2026-11-18T14:45',
      interval: 900,
      temperature_2m: 8.4,
      apparent_temperature: 5.1,
      relative_humidity_2m: 81,
      weather_code: 61,
      wind_speed_10m: 14.2,
      wind_direction_10m: 225,
      is_day: 1,
      precipitation: 0.3,
    },
    hourly: {
      time: times,
      temperature_2m: times.map((_, i) => 5 + (i % 24) / 4),
      weather_code: times.map((_, i) => (i % 2 ? 3 : 61)),
      precipitation_probability: times.map((_, i) => (i % 24) * 3),
    },
    daily: {
      time: ['2026-11-18', '2026-11-19'],
      weather_code: [61, 2],
      temperature_2m_max: [9.6, 11.2],
      temperature_2m_min: [3.1, 4.4],
      precipitation_probability_max: [70, 15],
      sunrise: ['2026-11-18T07:31', '2026-11-19T07:33'],
      sunset: ['2026-11-18T16:00', '2026-11-19T15:59'],
    },
  };
}

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe('weather helpers', () => {
  it('describes WMO codes, compass points and places', () => {
    expect(describeWeather(0)).toEqual({ label: 'Clear', icon: 'Sun' });
    expect(describeWeather(0, false).icon).toBe('Moon');
    expect(describeWeather(63).icon).toBe('CloudRain');
    expect(describeWeather(95).label).toBe('Thunderstorm');
    expect(describeWeather(1234).label).toBe('Unknown');
    expect(compass(225)).toBe('SW');
    expect(compass(359)).toBe('N');
    expect(compass(-90)).toBe('W');
    expect(placeLabel(LEEDS)).toBe('Leeds, England, United Kingdom');
    expect(placeLabel({ name: 'Paris', region: 'Paris', lat: 0, lon: 0 })).toBe('Paris');
  });

  it('builds URLs with only coordinates and units', () => {
    const u = new URL(forecastUrl(LEEDS, 'f', 'mph'));
    expect(u.host).toBe('api.open-meteo.com');
    expect(u.searchParams.get('latitude')).toBe('53.7965');
    expect(u.searchParams.get('temperature_unit')).toBe('fahrenheit');
    expect(u.searchParams.get('wind_speed_unit')).toBe('mph');
    expect(u.searchParams.get('timezone')).toBe('auto');
    expect(u.toString()).not.toContain('Leeds');
    expect(new URL(geocodeUrl('St Albans')).searchParams.get('name')).toBe('St Albans');
  });
});

describe('parseForecast', () => {
  it('reads current, the next 8 hours from now, today and tomorrow', () => {
    const d = parseForecast(forecastJson(), LEEDS, { temp: 'c', wind: 'kmh' }, 1000);
    expect(d.current).toMatchObject({ temp: 8.4, feels: 5.1, code: 61, isDay: true, windDir: 225 });
    expect(d.hourly).toHaveLength(8);
    expect(d.hourly[0]).toMatchObject({ time: '2026-11-18T14:00', hour: 14, rainChance: 42 });
    expect(d.hourly[7]?.hour).toBe(21);
    expect(d.today).toMatchObject({
      max: 9.6,
      min: 3.1,
      rainChance: 70,
      sunset: '2026-11-18T16:00',
    });
    expect(d.tomorrow).toEqual({ max: 11.2, min: 4.4, code: 2, rainChance: 15 });
    expect(rainSoon(d)).toBe(63);
  });

  it('copes with missing optional fields and rejects garbage', () => {
    const j = forecastJson() as Record<string, unknown>;
    delete j['hourly'];
    j['daily'] = { time: ['2026-11-18'] };
    const d = parseForecast(j, LEEDS, { temp: 'c', wind: 'kmh' }, 0);
    expect(d.hourly).toEqual([]);
    expect(d.tomorrow).toBeNull();
    expect(d.today.rainChance).toBeNull();
    expect(rainSoon(d)).toBeNull();
    expect(() => parseForecast({ error: true }, LEEDS, { temp: 'c', wind: 'kmh' }, 0)).toThrow(
      /unexpected response/,
    );
  });

  it('summarises for Claude in the user’s units', () => {
    const d = parseForecast(forecastJson(), LEEDS, { temp: 'f', wind: 'mph' }, 0);
    const s = weatherSummary(d, 5 * 60_000) as Record<string, Record<string, unknown> | unknown>;
    expect(s['place']).toBe('Leeds, England, United Kingdom');
    expect(s['readingAgeMinutes']).toBe(5);
    expect(s['now']).toMatchObject({
      conditions: 'Light rain',
      temp: '8°F',
      wind: '14 mph from SW',
    });
    expect(s['today']).toMatchObject({ high: '10°F', rainChance: '70%', sunrise: '07:31' });
    expect(s['nextHours']).toHaveLength(8);
    expect(s['tomorrow']).toMatchObject({ conditions: 'Partly cloudy' });
  });
});

describe('parsePlaces', () => {
  it('maps geocoding results and skips bad rows', () => {
    expect(
      parsePlaces({
        results: [
          {
            id: 1,
            name: 'Leeds',
            latitude: 53.79648,
            longitude: -1.54785,
            admin1: 'England',
            country: 'United Kingdom',
          },
          { id: 2, name: 'Broken' },
          null,
        ],
      }),
    ).toEqual([LEEDS]);
    expect(parsePlaces({})).toEqual([]);
    expect(parsePlaces(null)).toEqual([]);
  });
});

describe('WeatherService', () => {
  function service(opts: { fetch?: ReturnType<typeof vi.fn>; place?: WeatherPlace | null } = {}) {
    let now = 1_000_000;
    const cfg = {
      place: opts.place === undefined ? LEEDS : opts.place,
      temp: 'c' as const,
      wind: 'kmh' as const,
    };
    const fetch = opts.fetch ?? vi.fn(async () => ok(forecastJson()));
    const onChange = vi.fn();
    const file = join(mkdtempSync(join(tmpdir(), 'arc-wx-')), 'weather.json');
    const svc = new WeatherService({
      fetch: fetch as unknown as ConstructorParameters<typeof WeatherService>[0]['fetch'],
      file,
      config: () => cfg,
      onChange,
      now: () => now,
    });
    return { svc, fetch, onChange, file, cfg, tick: (ms: number) => (now += ms) };
  }

  it('fetches, caches to disk, and skips refreshes while fresh', async () => {
    const { svc, fetch, onChange, file, tick } = service();
    await svc.refresh();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(svc.get().data?.current.temp).toBe(8.4);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ fetchedAt: 1_000_000 }),
      null,
    );
    expect(JSON.parse(readFileSync(file, 'utf8')).place.name).toBe('Leeds');
    await svc.refresh();
    expect(fetch).toHaveBeenCalledTimes(1);
    tick(REFRESH_MS);
    await svc.refresh();
    expect(fetch).toHaveBeenCalledTimes(2);
    await svc.refresh(true);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('de-duplicates concurrent refreshes', async () => {
    const { svc, fetch } = service();
    await Promise.all([svc.refresh(true), svc.refresh(true), svc.refresh(true)]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the last reading when offline, and says so', async () => {
    const fetch = vi.fn(async () => ok(forecastJson()));
    const { svc } = service({ fetch });
    await svc.refresh();
    fetch.mockRejectedValueOnce(new Error('ENOTFOUND'));
    await svc.refresh(true);
    expect(svc.get().data?.current.temp).toBe(8.4);
    expect(svc.get().error).toMatch(/showing the last reading/);
    fetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    await svc.refresh(true);
    expect(svc.get().error).toMatch(/\(503\)/);
    await svc.refresh(true);
    expect(svc.get().error).toBeNull();
  });

  it('reports a plain error when offline with nothing cached', async () => {
    const { svc } = service({ fetch: vi.fn(async () => Promise.reject(new Error('x'))) });
    await svc.refresh();
    expect(svc.get()).toEqual({ data: null, error: expect.stringMatching(/internet connection/) });
  });

  it('hides a cached reading for another place or units, and clears with no place', async () => {
    const { svc, cfg, fetch } = service();
    await svc.refresh();
    cfg.temp = 'f' as never;
    expect(svc.get().data).toBeNull();
    cfg.temp = 'c' as never;
    expect(svc.get().data).not.toBeNull();
    cfg.place = null as never;
    await svc.refresh(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(svc.get()).toEqual({ data: null, error: null });
  });

  it('searches places and ignores too-short queries', async () => {
    const fetch = vi.fn(async (url: string) =>
      ok({ url, results: [{ name: 'Leeds', latitude: 1, longitude: 2 }] }),
    );
    const { svc } = service({ fetch });
    expect(await svc.search('L')).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    expect(await svc.search('Leeds')).toEqual([{ name: 'Leeds', lat: 1, lon: 2 }]);
    expect(String(fetch.mock.calls[0]?.[0])).toContain('geocoding-api.open-meteo.com');
  });
});

describe('weather settings and assistants', () => {
  it('sanitises place and units', () => {
    const s = sanitizeSettings({
      weatherPlace: { name: 'X', lat: 999, lon: 0 },
      tempUnit: 'k',
      windUnit: 'knots',
    });
    expect(s.weatherPlace).toBeNull();
    expect(s.tempUnit).toBe('c');
    expect(s.windUnit).toBe('kmh');
    expect(sanitizeSettings({ weatherPlace: LEEDS, tempUnit: 'f', windUnit: 'mph' })).toMatchObject(
      {
        weatherPlace: LEEDS,
        tempUnit: 'f',
        windUnit: 'mph',
      },
    );
  });

  it('exposes get_weather to Claude as a local tool', () => {
    expect(toIntent('get_weather', {})).toEqual({ local: 'get_weather' });
  });

  async function ask(text: string, data: WeatherData | null): Promise<string> {
    const out: ProviderChunk[] = [];
    for await (const c of new MockProvider(undefined, undefined, () => data).send(
      [{ role: 'user', content: text }],
      { systemPrompt: '' },
    ))
      out.push(c);
    return out.map((c) => (c.type === 'text' ? c.delta : '')).join('');
  }

  it('the offline brain answers weather questions', async () => {
    const d = parseForecast(forecastJson(), LEEDS, { temp: 'c', wind: 'kmh' }, 0);
    const reply = await ask('do I need an umbrella?', d);
    expect(reply).toMatch(/8°C and light rain in Leeds/);
    expect(reply).toMatch(/umbrella/);
    expect(await ask("what's the weather like", null)).toMatch(/Settings › General › Weather/);
  });
});
