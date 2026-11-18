import { useEffect } from 'react';
import { useSystemStore } from '@renderer/stores/systemStore';
import { useUiStore } from '@renderer/stores/uiStore';

/** Feeds systemStore from the main process: static machine info once, then live stats
 *  every ~2s (main pauses them while the window is hidden). The process list is only
 *  requested while the System tab is open, because it's the most expensive probe. */
export function useTelemetry(): void {
  const tab = useUiStore((s) => s.tab);

  useEffect(() => {
    const { setInfo, push } = useSystemStore.getState();
    void window.arc.system.getInfo().then(setInfo);
    void window.arc.system.getStats().then((s) => push(s, 'live'));
    return window.arc.system.onStats((s) => push(s, 'live'));
  }, []);

  useEffect(() => {
    window.arc.system.setDetail({ processes: tab === 'system' });
  }, [tab]);
}
