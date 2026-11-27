import { describe, expect, it } from 'vitest';
import { describeNow } from '@shared/context';

const now = new Date(2026, 10, 27, 17, 0).getTime();
const clock = (ms: number): string =>
  new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

describe('one picture of right now', () => {
  it('says nothing when nothing is known', () => {
    expect(describeNow({ now }, clock)).toBe('');
  });

  it('puts the useful things together, most important first', () => {
    const t = describeNow(
      {
        now,
        foreground: 'The user is in Vortex.',
        jobs: ['Updating mods', 'Updating mods'],
        nextEvent: { title: 'Dentist', start: now + 90 * 60_000, location: 'High St' },
        timers: [{ label: 'pizza', dueAt: now + 12 * 60_000 }],
        unread: { count: 4, from: ['Amazon', 'Mum'] },
        playing: { title: 'Midnight City', artist: 'M83', app: 'Spotify' },
        weather: { label: 'Light rain', temp: 7.4, unit: '°C', rainSoonMin: 20 },
        shiftToday: '18:00–22:00 at the warehouse',
      },
      clock,
    );
    expect(t.startsWith('Right now')).toBe(true);
    expect(t).toMatch(/The user is in Vortex\./);
    expect(t).toMatch(/Alton is busy with: Updating mods\./);
    expect(t).toMatch(/“Dentist” at 18:30 \(in 1 h 30 min\), High St/);
    expect(t).toMatch(/Timers: pizza in 12 min/);
    expect(t).toMatch(/Unread email: 4 \(from Amazon, Mum\)/);
    expect(t).toMatch(/Playing: Midnight City by M83 \(Spotify\)/);
    expect(t).toMatch(/Light rain, 7°C, rain in about 20 min/);
    expect(t.indexOf('Vortex')).toBeLessThan(t.indexOf('Dentist'));
  });

  it('leaves out past or far-off events and finished timers, and stays short', () => {
    const t = describeNow(
      {
        now,
        nextEvent: { title: 'Old', start: now - 1000 },
        timers: [{ label: 'done', dueAt: now - 1 }],
        foreground: 'x'.repeat(900),
      },
      clock,
    );
    expect(t).not.toMatch(/Old|done/);
    expect(t.length).toBeLessThanOrEqual(700);
  });
});
