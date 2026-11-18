import { create } from 'zustand';
import { DEFAULT_SETTINGS, type Settings } from '@shared/types';

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load(): Promise<void>;
  update(patch: Partial<Settings>): Promise<void>;
}

/** Keep in sync with changes made elsewhere (tray menu, main process). */
export function bindSettingsSync(): () => void {
  return window.arc.settings.onChange((settings) => useSettingsStore.setState({ settings }));
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  async load() {
    const settings = await window.arc.settings.get();
    set({ settings, loaded: true });
  },
  async update(patch) {
    // Optimistic: UI reacts immediately, main persists.
    set((s) => ({ settings: { ...s.settings, ...patch } }));
    await window.arc.settings.set(patch);
  },
}));
