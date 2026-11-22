import { describe, expect, it } from 'vitest';
import {
  planHeadsUps,
  rotaChangeNotes,
  tripWeather,
  type HeadsUpOptions,
  type HourWeather,
} from '@shared/headsups';
import { rotaChanges } from '@shared/shifts';

const base: HeadsUpOptions = {
  shiftEve: false,
  eveHour: 20,
  leave: false,
  travel: 25,
  morning: false,
  morningHour: 7,
  alarmRules: [],
  alarmLead: 90,
};
const now = new Date(2026, 10, 23, 9, 0);
const late = { title: 'Tesco', start: '2026-11-24T14:45', end: '2026-11-24T18:45' };
const early = { title: 'Tesco', start: '2026-11-25T07:00', end: '2026-11-25T15:00' };
const hour = (h: number, rain: number, code = 3, temp = 8): HourWeather => ({
  t: new Date(2026, 10, 24, h).getTime(),
  rain,
  temp,
  code,
});

describe('trip weather', () => {
  it('says when rain starts during the trip and shift', () => {
    const hours = [hour(13, 5), hour(14, 10), hour(17, 80, 61), hour(18, 90, 63)];
    const from = new Date(2026, 10, 24, 14, 10).getTime();
    const to = new Date(2026, 10, 24, 19, 10).getTime();
    expect(tripWeather(hours, from, to)).toBe('rain from 17:00, take a coat');
    expect(tripWeather([hour(14, 0, 71, -1)], from, to)).toBe('snow now, wrap up');
    expect(tripWeather([hour(14, 0, 1, 1)], from, to)).toBe('1°C, icy, wrap up');
    expect(tripWeather([hour(14, 0, 1, 9)], from, to)).toBe('');
  });
});

describe('rota change alerts', () => {
  it('names moved, new and removed shifts, and sums up big changes', () => {
    const saved = [
      { title: 'Work', start: '2026-11-24T09:00', end: '2026-11-24T17:00' },
      { title: 'Work', start: '2026-11-26T09:00', end: '2026-11-26T17:00' },
    ];
    // Tue moved, Wed new, and the saved Thu is gone (the new rota runs Tue–Fri).
    const incoming = [
      { title: 'Work', start: '2026-11-24T12:00', end: '2026-11-24T16:00' },
      { title: 'Work', start: '2026-11-25T07:00', end: '2026-11-25T15:00' },
      { title: 'Work', start: '2026-11-27T09:00', end: '2026-11-27T17:00' },
    ];
    const notes = rotaChangeNotes(
      rotaChanges(
        [...saved, { title: 'Work', start: '2026-11-27T09:00', end: '2026-11-27T17:00' }],
        incoming,
      ),
    );
    expect(notes.map((n) => n.title)).toEqual([
      'Tue 24 shift moved: 12:00–16:00',
      'New shift Wed 25: 07:00–15:00',
      'Thu 26 shift removed',
    ]);
    const many = rotaChangeNotes(
      rotaChanges(saved, [
        ...incoming,
        { title: 'W', start: '2026-11-28T07:00', end: '2026-11-28T15:00' },
      ]),
    );
    expect(many).toHaveLength(1);
    expect(many[0]?.title).toMatch(/^Rota changed: \d shifts$/);
  });
});

describe('new watch heads-ups', () => {
  it('adds the trip weather to leave-by', () => {
    const list = planHeadsUps([late], { ...base, leave: true, leaveWeather: true }, now, {
      hourly: [hour(14, 0), hour(17, 80, 61)],
    });
    expect(list.find((u) => u.key.startsWith('leave:'))?.title).toBe(
      'Leave in 10 min · rain from 17:00, take a coat',
    );
  });
  it('warns 30 minutes before the end and before the usual break', () => {
    const list = planHeadsUps([late], { ...base, shiftLeft: true, breakAfter: 120 }, now);
    const left = list.find((u) => u.key.startsWith('left:'));
    expect(left?.title).toBe('30 min left · finish 18:45');
    expect(new Date(left?.at ?? 0).getHours()).toBe(18);
    const brk = list.find((u) => u.key.startsWith('break:'));
    expect(brk?.title).toBe('Break in 10 min');
    expect(brk?.body).toBe('16:45 · Tesco');
  });
  it('gives one end-of-shift summary with tomorrow, the list and reminders', () => {
    const list = planHeadsUps([late, early], { ...base, summary: true, endLead: 0 }, now, {
      items: ['milk', 'bread'],
      reminders: [{ what: 'call the bank', at: new Date(2026, 10, 24, 19, 30).getTime() }],
    });
    const end = list.find((u) => u.key === `end:${late.start}`);
    expect(end?.title).toBe('Shift done · tomorrow 07:00–15:00');
    expect(end?.body).toBe('🛒 milk, bread\n⏰ 19:30 call the bank');
  });
  it('reminds about payday the evening before and that morning', () => {
    const list = planHeadsUps([], { ...base, payday: true }, now, {
      payday: { date: '2026-11-26', net: 292.6 },
    });
    expect(list.map((u) => u.title)).toEqual([
      '💷 Payday tomorrow ≈ £293',
      '💷 Payday today ≈ £293',
    ]);
  });
});
