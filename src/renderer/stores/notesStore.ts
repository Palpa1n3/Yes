import { create } from 'zustand';
import type { NotesOp, NotesState } from '@shared/notes';

export const useNotesStore = create<NotesState & { apply(op: NotesOp): Promise<void> }>((set) => ({
  lists: [],
  notes: [],
  memories: [],
  goals: [],
  async apply(op) {
    set(await window.arc.notes.apply(op));
  },
}));

export function bindNotes(): () => void {
  void window.arc.notes.state().then((s) => useNotesStore.setState(s));
  return window.arc.notes.onChange((s) => useNotesStore.setState(s));
}
