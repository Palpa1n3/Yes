import { describe, expect, it } from 'vitest';
import { hoursSvg, mondayOf, weekBars, weekSvg, weeksSummary } from '@shared/shiftChart';
import { phoneAvatarFor, THEME_ACCENT } from '@shared/looks';
import { mergeLists } from '@shared/phone';

const C = { bar: 'red', text: 'white', muted: 'grey', grid: 'grey', today: 'blue' };
const early = { title: 'Tesco <Early>', start: '2026-11-24T07:00', end: '2026-11-24T15:00' };
const night = { title: 'Night', start: '2026-11-26T22:00', end: '2026-11-27T06:00' };

describe('shift charts', () => {
  it('lays out the week, splitting overnight shifts across two days', () => {
    const mon = mondayOf(new Date(2026, 10, 25));
    expect(mon.getDate()).toBe(23);
    expect(weekBars([early, night], mon).map(([d, a, b]) => [d, a, b])).toEqual([
      [1, 420, 900],
      [3, 1320, 1440],
      [4, 0, 360],
    ]);
    const svg = weekSvg([early, night], mon, C, new Date(2026, 10, 24));
    expect(svg).toContain('Tesco &#60;Early&#62;'); // titles are escaped
    expect(svg).not.toContain('<Early>');
  });
  it('sums hours and pay per week', () => {
    const rows = weeksSummary([early, night], new Date(2026, 10, 25), 12, 30);
    expect(rows.map((r) => r.hours)).toEqual([0, 16, 0, 0]);
    expect(rows[1]?.pay).toBe(180);
    expect(hoursSvg(rows, C)).toContain('16h');
  });
});

describe('phone look', () => {
  it('uses the PC avatar itself on the phone (the phone draws them all now)', () => {
    expect(phoneAvatarFor('sphere')).toBe('sphere');
    expect(phoneAvatarFor('face')).toBe('face');
    expect(phoneAvatarFor('wave')).toBe('wave');
    expect(THEME_ACCENT['arc-cyan']).toBe('#3FD0FF');
    expect(mergeLists([], [], [])).toEqual([]);
  });
});
