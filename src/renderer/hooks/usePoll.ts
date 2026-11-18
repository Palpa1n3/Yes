import { useEffect, useState } from 'react';

/** Fetch now and then every `ms` while mounted (i.e. while the tab is on screen). */
export function usePoll<T>(fetcher: () => Promise<T>, ms: number): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    const run = (): void => {
      if (document.hidden) return;
      void fetcher()
        .then((d) => alive && setData(d))
        .catch(() => undefined);
    };
    run();
    const id = setInterval(run, ms);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // fetcher is a stable window.arc function
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms]);
  return data;
}
