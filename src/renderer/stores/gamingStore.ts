import { create } from 'zustand';
import { IDLE_GAMING, type GamingStatus } from '@shared/gaming';
import { useSettingsStore } from './settingsStore';

export const useGamingStore = create<GamingStatus>(() => ({ ...IDLE_GAMING }));

/** Gaming mode is on and ARC should stay silent (no speech, sounds or wake word). */
export const gamingQuiet = (): boolean =>
  useGamingStore.getState().active && useSettingsStore.getState().settings.gamingQuiet;

export function bindGaming(onChange?: (s: GamingStatus, prev: GamingStatus) => void): () => void {
  void window.arc.gaming.status().then((s) => useGamingStore.setState(s));
  return window.arc.gaming.onChange((s) => {
    const prev = useGamingStore.getState();
    useGamingStore.setState(s);
    onChange?.(s, prev);
  });
}
