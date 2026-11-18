import { create } from 'zustand';
import type { SystemInfo, SystemStats } from '@shared/types';

const HISTORY = 60;

export interface History {
  cpu: number[];
  mem: number[];
  gpu: number[];
  down: number[];
  up: number[];
}

interface SystemState {
  info: SystemInfo | null;
  stats: SystemStats | null;
  history: History;
  /** Where telemetry is coming from — shown in the status bar so mock data is never mistaken for real. */
  source: 'mock' | 'live';
  setInfo(info: SystemInfo): void;
  push(stats: SystemStats, source: 'mock' | 'live'): void;
}

const append = (arr: number[], v: number): number[] => [...arr.slice(-(HISTORY - 1)), v];

export const useSystemStore = create<SystemState>((set) => ({
  info: null,
  stats: null,
  history: { cpu: [], mem: [], gpu: [], down: [], up: [] },
  source: 'mock',
  setInfo: (info) => set({ info }),
  push: (stats, source) =>
    set((s) => ({
      stats,
      source,
      history: {
        cpu: append(s.history.cpu, stats.cpu.load),
        mem: append(s.history.mem, (stats.memory.used / stats.memory.total) * 100),
        gpu: append(s.history.gpu, stats.gpu?.load ?? 0),
        down: append(s.history.down, stats.network.down),
        up: append(s.history.up, stats.network.up),
      },
    })),
}));
