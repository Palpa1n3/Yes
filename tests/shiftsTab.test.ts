import { describe, expect, it } from 'vitest';
import {
  daysOff,
  manualShift,
  monthGrid,
  monthHours,
  rotaText,
  shiftKind,
  shiftsFromCalendar,
} from '../src/shared/shifts';

const sh = (start: string, end: string, title = 'Work') => ({ title, start, end });

describe('shifts tab helpers', () => {
  it('names shifts by start time', () => {
    expect(shiftKind(sh('2026-11-24T06:00', '2026-11-24T14:00'))).toBe('early');
    expect(shiftKind(sh('2026-11-24T10:00', '2026-11-24T18:00'))).toBe('day');
    expect(shiftKind(sh('2026-11-24T14:00', '2026-11-24T22:00'))).toBe('late');
    expect(shiftKind(sh('2026-11-24T22:00', '2026-11-25T06:00'))).toBe('night');
  });

  it('builds a Monday-first month with shifts on their days', () => {
    const s = sh('2026-11-24T07:00', '2026-11-24T15:00');
    const g = monthGrid(2026, 10, [s]); // November 2026 starts on a Sunday
    expect(g[0]?.[0]?.date).toBe('2026-10-26');
    expect(g[0]?.[6]?.date).toBe('2026-11-01');
    expect(g.every((w) => w.length === 7)).toBe(true);
    const day = g.flat().find((d) => d.date === '2026-11-24');
    expect(day?.shifts).toEqual([s]);
    expect(day?.inMonth).toBe(true);
    expect(g[g.length - 1]?.[6]?.date).toBe('2026-12-06');
  });

  it('adds up a month and counts days off', () => {
    const a = sh('2026-11-24T07:00', '2026-11-24T15:00');
    const b = sh('2026-11-25T12:00', '2026-11-25T16:30');
    expect(monthHours([a, b], 2026, 10)).toBe(12.5);
    expect(daysOff([a, b], 7, new Date(2026, 10, 23))).toBe(5);
  });

  it('turns matching calendar events into shifts', () => {
    const t = (d: number, h: number) => new Date(2026, 10, d, h).getTime();
    const out = shiftsFromCalendar(
      [
        { title: 'Shift: Tesco', start: t(24, 7), end: t(24, 15), allDay: false },
        { title: 'Dentist', start: t(25, 9), end: t(25, 10), allDay: false },
        { title: 'Work holiday', start: t(26, 0), end: t(27, 0), allDay: true },
      ],
      'shift, work',
    );
    expect(out).toEqual([
      { title: 'Shift: Tesco', start: '2026-11-24T07:00', end: '2026-11-24T15:00' },
    ]);
    expect(shiftsFromCalendar([], '')).toEqual([]);
  });

  it('makes a shift typed in by hand, overnight too', () => {
    expect(manualShift('2026-11-24', '07:00', '15:00')).toEqual(
      sh('2026-11-24T07:00', '2026-11-24T15:00'),
    );
    expect(manualShift('2026-11-30', '22:00', '06:00', 'Nights')?.end).toBe('2026-12-01T06:00');
    expect(manualShift('bad', '07:00', '15:00')).toBeNull();
    expect(manualShift('2026-11-24', '07:00', '07:00')).toBeNull();
  });

  it('writes the rota as text to share', () => {
    const txt = rotaText(
      [sh('2026-11-24T07:00', '2026-11-24T15:00', 'Tesco')],
      new Date(2026, 10, 20),
    );
    expect(txt).toContain('My shifts:');
    expect(txt).toContain('Tesco');
    expect(rotaText([], new Date())).toBe('No shifts coming up.');
  });
});

describe('at work', () => {
  it('lists what is left and plans before-you-leave notes', async () => {
    const { workItems, shiftEndNotes } = await import('../src/shared/shifts');
    const lists = [
      {
        name: 'Shopping',
        items: [
          { text: 'Milk', done: false },
          { text: 'Eggs', done: true },
        ],
      },
      { name: 'To-do', items: [{ text: 'Call bank', done: false }] },
    ];
    expect(workItems(lists, ['shopping'])).toEqual(['Milk']);
    const now = new Date(2026, 10, 21, 8);
    const notes = shiftEndNotes(
      [sh('2026-11-21T09:00', '2026-11-21T17:00'), sh('2026-12-20T09:00', '2026-12-20T17:00')],
      ['Milk'],
      'Morrisons',
      15,
      now,
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]?.title).toBe('🛒 Before you leave Morrisons');
    expect(new Date(notes[0]?.at ?? 0).getHours()).toBe(16);
    expect(new Date(notes[0]?.at ?? 0).getMinutes()).toBe(45);
    expect(shiftEndNotes([sh('2026-11-21T09:00', '2026-11-21T17:00')], [], 'x', 15, now)).toEqual(
      [],
    );
  });
});
