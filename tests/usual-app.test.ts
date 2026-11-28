import { describe, expect, it } from 'vitest';
import { usualAppRule, usualNow, type DayOpen } from '@shared/initiative';

const day = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date(2026, 10, 28, 9, 30);
const back = (k: number): string => day(new Date(now.getTime() - k * 86_400_000));

describe('what the user usually opens around now', () => {
  const opens: DayOpen[] = [
    ...[1, 2, 3, 5].map((k) => ({ app: 'Spotify', day: back(k), minute: 9 * 60 + 25 })),
    ...[1, 2, 3, 4, 5].map((k) => ({ app: 'PickerHost', day: back(k), minute: 9 * 60 + 30 })),
    ...[1, 2].map((k) => ({ app: 'Discord', day: back(k), minute: 9 * 60 + 30 })),
    ...[1, 2, 3, 4].map((k) => ({ app: 'Steam', day: back(k), minute: 20 * 60 })),
  ];

  it('offers an app opened at about this time on most recent days', () => {
    expect(usualNow(opens, now)).toEqual({ app: 'Spotify', days: 4 });
  });

  it('not when it was already opened today, nor background helpers', () => {
    expect(usualNow([...opens, { app: 'Spotify', day: day(now), minute: 8 * 60 }], now)).toBeNull();
  });

  it('becomes a suggestion with a one-tap Open', () => {
    const s = usualAppRule({
      now,
      stats: null,
      events: null,
      weather: null,
      email: [],
      routines: [],
      userName: '',
      usualApp: { app: 'Spotify', days: 4 },
    });
    expect(s?.text).toBe('You usually open Spotify around now. Want me to open it?');
    expect(s?.action?.intent).toEqual({ action: 'launch_app', target: 'Spotify' });
  });
});
