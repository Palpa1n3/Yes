import { create } from 'zustand';
import type { WeatherState } from '@shared/ipc';

interface WeatherStore extends WeatherState {
  loading: boolean;
  refresh(): Promise<void>;
}

/** Mirror of main's WeatherService (main fetches, caches and refreshes every 15 min). */
export const useWeatherStore = create<WeatherStore>((set) => ({
  data: null,
  error: null,
  loading: false,
  async refresh() {
    set({ loading: true });
    try {
      set({ ...(await window.arc.weather.refresh()), loading: false });
    } catch {
      set({ loading: false, error: "Couldn't reach the weather service." });
    }
  },
}));

export function bindWeather(): () => void {
  void window.arc.weather.get().then((s) => useWeatherStore.setState(s));
  return window.arc.weather.onChange((s) => useWeatherStore.setState({ ...s, loading: false }));
}
