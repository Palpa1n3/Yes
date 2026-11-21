import { describe, expect, it } from 'vitest';
import { noteId, planHeadsUps, type HeadsUpOptions } from '@shared/headsups';

const o: HeadsUpOptions = {
  shiftEve: true,
  eveHour: 20,
  leave: true,
  travel: 25,
  morning: true,
  morningHour: 7,
  alarmRules: [],
  alarmLead: 90,
};
const now = new Date(2026, 10, 21, 12, 0);
const shift = { title: 'Tesco', start: '2026-11-22T07:00', end: '2026-11-22T15:00' };

describe('watch heads-ups', () => {
  it('buzzes the evening before, 10 minutes before leaving, and each morning', () => {
    const list = planHeadsUps([shift], o, now, {
      forecast: { '2026-11-22': 'light rain, 4–9°C' },
      events: [{ title: 'Dentist', start: new Date(2026, 10, 22, 16, 30).getTime() }],
    });
    const eve = list.find((x) => x.key.startsWith('eve:'));
    expect(new Date(eve?.at ?? 0).getHours()).toBe(20);
    expect(eve?.body).toBe('07:00–15:00 · alarm 05:30 · leave by 06:35');
    const leave = list.find((x) => x.key.startsWith('leave:'));
    expect(new Date(leave?.at ?? 0).toTimeString().slice(0, 5)).toBe('06:25');
    const morning = list.find((x) => x.key === 'morning:2026-11-22');
    expect(morning?.body).toBe('Tesco 07:00–15:00 · 16:30 Dentist · light rain, 4–9°C');
    expect(list.map((x) => x.at)).toEqual([...list.map((x) => x.at)].sort((a, b) => a - b));
  });
  it('skips what is switched off or already past, with stable ids', () => {
    expect(
      planHeadsUps([shift], { ...o, shiftEve: false, leave: false, morning: false }, now),
    ).toEqual([]);
    const late = new Date(2026, 10, 21, 21, 0);
    expect(planHeadsUps([shift], { ...o, morning: false }, late).map((x) => x.key)).toEqual([
      'leave:2026-11-22T07:00',
    ]);
    expect(noteId('eve:x')).toBe(noteId('eve:x'));
    expect(noteId('eve:x')).not.toBe(noteId('eve:y'));
    expect(noteId('a')).toBeGreaterThan(0);
  });
});
