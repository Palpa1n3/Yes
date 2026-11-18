import { create } from 'zustand';
import type { AppEntry } from '@shared/types';

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

interface AppsState {
  apps: AppEntry[];
  loaded: boolean;
  /** Most recent first, by app id. Kept for this session. */
  recent: string[];
  load(): Promise<void>;
  save(entry: AppEntry): Promise<void>;
  remove(id: string): Promise<void>;
  find(target: string): AppEntry | undefined;
  noteLaunched(target: string): void;
}

/** Renderer view of userData/apps.json (main owns the file). */
export const useAppsStore = create<AppsState>((set, get) => ({
  apps: [],
  loaded: false,
  recent: [],
  async load() {
    set({ apps: await window.arc.apps.list(), loaded: true });
  },
  async save(entry) {
    set({ apps: await window.arc.apps.save(entry) });
  },
  async remove(id) {
    set((s) => ({ recent: s.recent.filter((r) => r !== id) }));
    set({ apps: await window.arc.apps.remove(id) });
  },
  find(target) {
    const q = norm(target);
    if (!q) return undefined;
    const { apps } = get();
    return (
      apps.find(
        (a) => norm(a.id) === q || norm(a.name) === q || (a.startMenu && norm(a.startMenu) === q),
      ) ?? apps.find((a) => a.intents.some((i) => norm(i) === q))
    );
  },
  noteLaunched(target) {
    const id = get().find(target)?.id ?? target.toLowerCase();
    set((s) => ({ recent: [id, ...s.recent.filter((r) => r !== id)].slice(0, 8) }));
  },
}));
