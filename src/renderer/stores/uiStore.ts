import { create } from 'zustand';

export const TAB_IDS = [
  'overview',
  'chat',
  'notes',
  'system',
  'tasks',
  'apps',
  'network',
  'storage',
  'routines',
  'mods',
  'minecraft',
] as const;
export type TabId = (typeof TAB_IDS)[number];

export const SETTINGS_TABS = [
  'general',
  'ai',
  'smart',
  'connections',
  'personality',
  'appearance',
  'voice',
  'gaming',
  'hotkeys',
  'privacy',
  'advanced',
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

interface UiState {
  tab: TabId;
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  setTab(tab: TabId): void;
  openSettings(tab?: SettingsTab): void;
  closeSettings(): void;
  setSettingsTab(tab: SettingsTab): void;
}

export const useUiStore = create<UiState>((set) => ({
  tab: 'overview',
  settingsOpen: false,
  settingsTab: 'general',
  setTab: (tab) => set({ tab }),
  openSettings: (tab) => {
    void import('@renderer/voice/sfx').then((m) => m.playSfx('open'));
    set((s) => ({ settingsOpen: true, settingsTab: tab ?? s.settingsTab }));
  },
  closeSettings: () => set({ settingsOpen: false }),
  setSettingsTab: (settingsTab) => set({ settingsTab }),
}));
