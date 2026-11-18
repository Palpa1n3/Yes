import { app, net } from 'electron';
import { join } from 'node:path';
import { IPC } from '@shared/ipc';
import type { MainContext } from '../context';
import { WeatherService } from '../services/weather';
import { emit, handle } from './handle';

export function registerWeatherIpc(ctx: MainContext): WeatherService {
  const weather = new WeatherService({
    fetch: (url) => net.fetch(url),
    file: join(app.getPath('userData'), 'weather.json'),
    config: () => {
      const s = ctx.settings.get();
      return { place: s.weatherPlace, temp: s.tempUnit, wind: s.windUnit };
    },
    onChange: (data, error) => emit(ctx.getWindow(), IPC.weather.onChange, { data, error }),
  });

  handle(IPC.weather.get, () => {
    void weather.refresh(); // no-op unless stale
    return weather.get();
  });
  handle(IPC.weather.refresh, async () => {
    await weather.refresh(true);
    return weather.get();
  });
  handle(IPC.weather.search, (q) => weather.search(typeof q === 'string' ? q : ''));

  // A new town or units: fetch straight away.
  ctx.settings.subscribe((next, prev) => {
    const moved =
      next.weatherPlace?.lat !== prev.weatherPlace?.lat ||
      next.weatherPlace?.lon !== prev.weatherPlace?.lon;
    if (moved || next.tempUnit !== prev.tempUnit || next.windUnit !== prev.windUnit)
      void weather.refresh(true);
  });
  weather.start();
  return weather;
}
