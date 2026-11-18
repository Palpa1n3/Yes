import { useEffect, useState } from 'react';
import type { WindowStatePayload } from '@shared/types';

/** Tracks maximised / compact state (title-bar glyph, shell radius, compact layout). */
export function useWindowState(): WindowStatePayload {
  const [state, setState] = useState<WindowStatePayload>({ maximized: false, compact: false });
  useEffect(() => {
    let alive = true;
    void window.arc.window.getState().then((s) => alive && setState(s));
    const off = window.arc.window.onState(setState);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return state;
}
