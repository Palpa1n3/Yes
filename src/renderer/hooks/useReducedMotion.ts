import { useEffect, useState } from 'react';
import { useSettingsStore } from '@renderer/stores/settingsStore';

const query = '(prefers-reduced-motion: reduce)';

/** True when motion should be reduced: the Settings override wins, else the OS preference. */
export function useReducedMotion(): boolean {
  const pref = useSettingsStore((s) => s.settings.reduceMotion);
  const [system, setSystem] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = (e: MediaQueryListEvent): void => setSystem(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return pref === 'on' ? true : pref === 'off' ? false : system;
}
