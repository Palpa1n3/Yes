import { create } from 'zustand';
import type { NowPlaying } from '@shared/media';

export const useMediaStore = create<{ now: NowPlaying | null }>(() => ({ now: null }));

export function bindMedia(): () => void {
  void window.arc.media.get().then((now) => useMediaStore.setState({ now }));
  return window.arc.media.onChange((now) => useMediaStore.setState({ now }));
}
