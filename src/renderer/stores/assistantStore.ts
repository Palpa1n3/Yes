import { create } from 'zustand';
import type { AssistantState } from '@shared/types';
import { ERROR_HOLD_MS } from '@renderer/components/core/motion';

export type ActivityKind = 'app' | 'sys' | 'net' | 'dsk' | 'rtn' | 'msg';

export interface ActivityEntry {
  id: string;
  timestamp: number;
  kind: ActivityKind;
  label: string;
  status: 'pending' | 'success' | 'failed';
}

interface AssistantStoreState {
  state: AssistantState;
  /** Context for the current state, e.g. "Launching · VS Code" while executing. */
  stateDetail: string | undefined;
  /** 0–1 audio amplitude for the core. The single source for listening/speaking
   *  visuals: fake now (useFakeAudio), microphone / TTS output later. */
  audioLevel: number;
  /** Real speech output is playing (the fake level generator stands down). */
  speechActive: boolean;
  activity: ActivityEntry[];
  setState(state: AssistantState, detail?: string): void;
  setAudioLevel(level: number): void;
  setSpeechActive(on: boolean): void;
  logActivity(entry: Omit<ActivityEntry, 'id' | 'timestamp'>): void;
}

let errorTimer: ReturnType<typeof setTimeout> | undefined;

export const useAssistantStore = create<AssistantStoreState>((set, get) => ({
  state: 'idle',
  stateDetail: undefined,
  audioLevel: 0,
  speechActive: false,
  activity: [],
  setState: (state, detail) => {
    clearTimeout(errorTimer);
    set({ state, stateDetail: detail });
    // `error` is transient: flicker, then settle back to idle.
    if (state === 'error') {
      errorTimer = setTimeout(() => {
        if (get().state === 'error') set({ state: 'idle', stateDetail: undefined });
      }, ERROR_HOLD_MS);
    }
  },
  setAudioLevel: (audioLevel) => set({ audioLevel }),
  setSpeechActive: (speechActive) => set({ speechActive }),
  logActivity: (entry) =>
    set((s) => ({
      activity: [{ ...entry, id: crypto.randomUUID(), timestamp: Date.now() }, ...s.activity].slice(
        0,
        100,
      ),
    })),
}));

/** Non-reactive read for render loops (no React re-render per frame). */
export const readAudioLevel = (): number => useAssistantStore.getState().audioLevel;
