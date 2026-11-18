import { create } from 'zustand';
import type { Routine } from '@shared/routines';
import type { RoutineProgress } from '@shared/types';
import { useAssistantStore } from './assistantStore';

export interface RunState {
  routineId: string;
  name: string;
  /** Per step: undefined = not reached yet. */
  steps: Array<{ status: RoutineProgress['status']; message: string } | undefined>;
  finished: boolean;
}

interface RoutinesState {
  routines: Routine[];
  loaded: boolean;
  run: RunState | null;
  save(r: Routine): Promise<Routine[]>;
  remove(id: string): Promise<void>;
}

/** Mirror of main's RoutineService. Running goes through the conversation (a command card). */
export const useRoutinesStore = create<RoutinesState>((set) => ({
  routines: [],
  loaded: false,
  run: null,
  async save(r) {
    const routines = await window.arc.routines.save(r);
    set({ routines });
    return routines;
  },
  async remove(id) {
    set({ routines: await window.arc.routines.remove(id) });
  },
}));

/** Apply one progress event to the run log. */
export function applyProgress(run: RunState | null, p: RoutineProgress): RunState {
  const same = run && run.routineId === p.routineId && !run.finished && p.index > 0;
  const steps = same ? [...run.steps] : Array.from({ length: p.total }, () => undefined);
  steps[p.index] = { status: p.status, message: p.message };
  const finished = p.index === p.total - 1 && p.status !== 'running';
  return { routineId: p.routineId, name: p.name, steps, finished };
}

/** `say(text)` shows (and speaks) ARC's lines from say / briefing steps. */
export function bindRoutines(say: (text: string) => void): () => void {
  void window.arc.routines
    .list()
    .then((routines) => useRoutinesStore.setState({ routines, loaded: true }));
  const offChange = window.arc.routines.onChange((routines) =>
    useRoutinesStore.setState({ routines, loaded: true }),
  );
  const offProgress = window.arc.routines.onProgress((p) => {
    useRoutinesStore.setState((s) => ({ run: applyProgress(s.run, p) }));
    if (p.say) say(p.say);
    if (p.status !== 'running' && !p.say)
      useAssistantStore.getState().logActivity({
        kind: 'rtn',
        label: `${p.name} ${p.index + 1}/${p.total}: ${p.message}`,
        status: p.status === 'success' ? 'success' : 'failed',
      });
  });
  return () => {
    offChange();
    offProgress();
  };
}
