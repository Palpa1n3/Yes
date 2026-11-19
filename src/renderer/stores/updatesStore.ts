import { create } from 'zustand';
import type { UpdateState } from '@shared/updates';

export const useUpdatesStore = create<UpdateState>(() => ({
  status: 'idle',
  current: '',
  version: null,
  percent: null,
  error: null,
  checkedAt: null,
}));

export function bindUpdates(): () => void {
  void window.arc.updates.state().then((s) => useUpdatesStore.setState(s));
  return window.arc.updates.onChange((s) => useUpdatesStore.setState(s));
}
