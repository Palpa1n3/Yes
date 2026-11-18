import { create } from 'zustand';
import type { TimerInfo } from '@shared/types';

interface TimersState {
  timers: TimerInfo[];
  add(minutes: number, label?: string): Promise<void>;
  cancel(id: string): void;
  snooze(id: string, minutes?: number): void;
}

/** Mirror of main's TimerService (main owns the clock and persistence). */
export const useTimersStore = create<TimersState>((set) => ({
  timers: [],
  async add(minutes, label = '') {
    set({ timers: await window.arc.timers.add(minutes, label) });
  },
  cancel: (id) => window.arc.timers.cancel(id),
  snooze: (id, minutes = 5) => window.arc.timers.snooze(id, minutes),
}));

export function bindTimers(onRing: (t: TimerInfo) => void): () => void {
  void window.arc.timers.list().then((timers) => useTimersStore.setState({ timers }));
  const offChange = window.arc.timers.onChange((timers) => useTimersStore.setState({ timers }));
  const offRing = window.arc.timers.onRing(onRing);
  return () => {
    offChange();
    offRing();
  };
}

/** "4:05", "1:02:09", or "42s" style countdown. */
export function fmtRemaining(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export const timerTitle = (t: TimerInfo): string => {
  if (t.label) return t.label;
  const min = t.durationMs / 60_000;
  return min < 1
    ? `${Math.round(min * 60)} sec timer`
    : min >= 60 && min % 60 === 0
      ? `${min / 60} hour timer`
      : `${+min.toFixed(1)} min timer`;
};
