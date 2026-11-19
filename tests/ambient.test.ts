import { describe, expect, it } from 'vitest';
import {
  dayPhase,
  isFestive,
  isFrosty,
  precipFor,
  sunsetGlow,
  tintFor,
  toC,
} from '@shared/ambient';
import { sanitizeSettings } from '@shared/settings';

describe('ambient look', () => {
  it('turns weather codes into rain or snow', () => {
    expect(precipFor(61)).toBe('rain');
    expect(precipFor(81)).toBe('rain');
    expect(precipFor(95)).toBe('rain');
    expect(precipFor(73)).toBe('snow');
    expect(precipFor(2)).toBe('none');
  });
  it('frost when cold, glow around sunset, December is festive', () => {
    expect(isFrosty(toC(35, 'f'))).toBe(true);
    expect(isFrosty(8)).toBe(false);
    const sunset = '2026-11-20T16:00';
    expect(sunsetGlow(new Date(2026, 10, 20, 16, 0), sunset)).toBe(1);
    expect(sunsetGlow(new Date(2026, 10, 20, 15, 30), sunset)).toBeCloseTo(0.5);
    expect(sunsetGlow(new Date(2026, 10, 20, 13, 0), sunset)).toBe(0);
    expect(isFestive(new Date(2026, 11, 5))).toBe(true);
    expect(isFestive(new Date(2026, 10, 30))).toBe(false);
  });
  it('colours follow the time of day', () => {
    expect(dayPhase(7)).toBe('morning');
    expect(dayPhase(19)).toBe('evening');
    expect(dayPhase(2)).toBe('night');
    expect(tintFor('evening').color).toBe('255 160 70');
    expect(tintFor('night').dim).toBeGreaterThan(0);
    expect(tintFor('day').alpha).toBe(0);
  });
  it('settings default on, screensaver after 10 minutes', () => {
    const s = sanitizeSettings({});
    expect([s.ambient, s.timeTint, s.screensaverMinutes]).toEqual([true, true, 10]);
    expect(sanitizeSettings({ screensaverMinutes: 7 }).screensaverMinutes).toBe(10);
  });
});
