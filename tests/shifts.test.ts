import { describe, expect, it, vi } from 'vitest';
import {
  alarmFor,
  buildIcs,
  currentShift,
  homeBy,
  timeLeft,
  leaveBy,
  paidHours,
  weekPay,
  cleanShifts,
  describeShift,
  mergeShifts,
  nextShift,
  parseAlarmRules,
  replaceRota,
  rotaChanges,
  shiftKey,
  spokenTime,
  upcomingShifts,
  weekHours,
} from '@shared/shifts';
import { runPhoneTool } from '../phone/src/tools';

const st = { people: [], memories: [], lists: [], country: '44', android: true };

describe('shifts from a rota screenshot', () => {
  it('fixes overnight shifts, drops bad and duplicate ones, sorts them', () => {
    const out = cleanShifts([
      { title: 'Nights', start: '2026-11-26T22:00', end: '2026-11-26T06:00' },
      { start: '2026-11-24T07:00', end: '2026-11-24T15:30' },
      { start: '2026-11-24T07:00', end: '2026-11-24T15:30', title: 'dup' },
      { start: '2026-02-30T07:00', end: '2026-02-30T15:00' },
      { start: 'tomorrow', end: 'later' },
    ]);
    expect(out).toEqual([
      { title: 'Work', start: '2026-11-24T07:00', end: '2026-11-24T15:30' },
      { title: 'Nights', start: '2026-11-26T22:00', end: '2026-11-27T06:00' },
    ]);
    expect(describeShift(out[0]!)).toBe('Tue 24 Nov 07:00–15:30 (8.5h)');
  });

  it('builds one calendar file with every shift and a reminder', () => {
    const ics = buildIcs(
      cleanShifts([
        { title: 'Tesco, early; till', start: '2026-11-24T07:00', end: '2026-11-24T15:00' },
        { start: '2026-11-25T12:00', end: '2026-11-25T20:00', location: 'Leeds' },
      ]),
      60,
      new Date('2026-11-19T12:00:00Z'),
    );
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('DTSTART:20261124T070000\r\n');
    expect(ics).toContain('DTEND:20261124T150000\r\n');
    expect(ics).toContain(String.raw`SUMMARY:Tesco\, early\; till`);
    expect(ics).toContain('UID:shift-20261124T070000-20261124T150000@alton');
    expect(ics).toContain('TRIGGER:-PT60M');
    expect(ics).toContain('LOCATION:Leeds');
    expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true);
  });

  it('the add_shifts tool gives one button for all plus one per shift, skipping ones already added', () => {
    const shifts = [
      { title: 'Work', start: '2026-11-24T07:00', end: '2026-11-24T15:00' },
      { title: 'Work', start: '2026-11-25T07:00', end: '2026-11-25T15:00' },
    ];
    const r = runPhoneTool('add_shifts', { shifts }, st);
    expect(r.actions?.[0]?.label).toBe('Add 2 shifts to my calendar');
    expect(r.actions?.[0]?.ics?.text).toContain('BEGIN:VCALENDAR');
    expect(r.actions).toHaveLength(3);
    expect(r.actions?.[1]?.href).toContain('calendar.google.com');

    const again = runPhoneTool(
      'add_shifts',
      { shifts },
      {
        ...st,
        addedShifts: [shiftKey(shifts[0]!)],
      },
    );
    expect(again.actions?.[0]?.label).toBe('Add 1 shift to my calendar');
    expect(again.result).toContain('1 were already added');

    const none = runPhoneTool(
      'add_shifts',
      { shifts },
      {
        ...st,
        addedShifts: shifts.map(shiftKey),
      },
    );
    expect(none.actions).toBeUndefined();
    expect(none.result).toContain('already added');
    expect(runPhoneTool('add_shifts', { shifts: [] }, st).result).toContain('No usable shifts');
  });
});

describe('shift alarms and Alexa', () => {
  const early = { title: 'Early', start: '2026-11-20T07:00', end: '2026-11-20T15:00' };
  const late = { title: 'Late', start: '2026-11-22T12:00', end: '2026-11-22T20:00' };

  it('reads alarm rules in a few forms', () => {
    expect(parseAlarmRules('7:00=5:45, 12.00 -> 10:00\n22:00 → 19:30; junk')).toEqual([
      { start: '07:00', alarm: '05:45' },
      { start: '12:00', alarm: '10:00' },
      { start: '22:00', alarm: '19:30' },
    ]);
  });

  it('uses the exact rule, else the lead time', () => {
    const rules = parseAlarmRules('07:00=05:45');
    expect(alarmFor(early, rules, 90).time).toBe('05:45');
    expect(alarmFor(late, rules, 90)).toEqual({ hour: 10, minute: 30, time: '10:30' });
    expect(alarmFor({ ...early, start: '2026-11-20T00:30' }, [], 60).time).toBe('23:30');
  });

  it('finds tomorrow’s shift and says the time the way Alexa expects', () => {
    const now = new Date(2026, 10, 19, 20, 0);
    expect(nextShift([late, early], now)).toEqual({ shift: early, when: 'tomorrow' });
    expect(nextShift([late], now)).toBeNull();
    expect(spokenTime('05:45')).toBe('5:45 a.m.');
    expect(spokenTime('19:00')).toBe('7 p.m.');
    expect(spokenTime('00:15')).toBe('12:15 a.m.');
  });

  it('counts hours per week and keeps the saved list tidy', () => {
    const now = new Date(2026, 10, 19, 12);
    expect(weekHours([early, late], now)).toBe(16);
    const old = { title: 'Old', start: '2026-11-01T07:00', end: '2026-11-01T15:00' };
    const merged = mergeShifts([old, early], [{ ...early, title: 'Early (Tesco)' }, late], now);
    expect(merged.map((s) => s.title)).toEqual(['Early (Tesco)', 'Late']);
    expect(upcomingShifts(merged, new Date(2026, 10, 21)).map((s) => s.title)).toEqual(['Late']);
  });

  it('tools: get_shifts lists them, tell_alexa makes a speak button, add_shifts hands shifts back', () => {
    // The shifts in this file are fixed dates: look at them from the day before.
    vi.useFakeTimers({ now: new Date(2026, 10, 19, 12), toFake: ['Date'] });
    const g = runPhoneTool('get_shifts', {}, { ...st, shifts: [early, late] });
    vi.useRealTimers();
    expect(g.result).toContain('Early');
    expect(g.result).toContain('Hours this week');
    const a = runPhoneTool('tell_alexa', { command: 'Alexa, turn on my 5:45 alarm' }, st);
    expect(a.action?.alexa).toBe('turn on my 5:45 alarm');
    const add = runPhoneTool('add_shifts', { shifts: [early] }, st);
    expect(add.shifts).toHaveLength(1);
  });
});

describe('pay, leave-by and the PC rota', () => {
  const long = { title: 'Long', start: '2026-11-20T07:00', end: '2026-11-20T17:00' };
  const short = { title: 'Short', start: '2026-11-21T09:00', end: '2026-11-21T13:00' };

  it('estimates weekly pay with an unpaid break on long shifts only', () => {
    expect(paidHours(long, 30)).toBe(9.5);
    expect(paidHours(short, 30)).toBe(4);
    expect(weekPay([long, short], 12, 30, new Date(2026, 10, 19))).toBe(162);
    expect(weekPay([long], 0, 30, new Date(2026, 10, 19))).toBe(0);
  });

  it('works out when to leave', () => {
    expect(leaveBy(long, 25)).toBe('06:35');
    expect(leaveBy(long, 0)).toBe('');
  });
});

describe('spotting rota changes', () => {
  const sh = (day: string, a: string, b: string, title = 'Work') => ({
    title,
    start: `2026-11-${day}T${a}`,
    end: `2026-11-${day}T${b}`,
  });
  const saved = [
    sh('23', '07:00', '15:00'),
    sh('24', '07:00', '15:00'),
    sh('26', '12:00', '20:00'),
    sh('30', '07:00', '15:00'),
  ];
  const fresh = [
    sh('23', '07:00', '15:00'),
    sh('24', '09:00', '17:00'),
    sh('27', '12:00', '20:00'),
  ];

  it('finds changed, removed and new shifts within the new rota’s days only', () => {
    const c = rotaChanges(saved, fresh);
    expect(c.changed).toEqual([{ from: saved[1], to: fresh[1] }]);
    expect(c.removed).toEqual([saved[2]]);
    expect(c.added).toEqual([fresh[2]]);
  });

  it('replaces the covered days and keeps the rest', () => {
    const out = replaceRota(saved, fresh, new Date(2026, 10, 20));
    expect(out.map((s) => s.start.slice(8, 16))).toEqual([
      '23T07:00',
      '24T09:00',
      '27T12:00',
      '30T07:00',
    ]);
  });

  it('add_shifts leads with the changes', () => {
    const r = runPhoneTool('add_shifts', { shifts: fresh }, { ...st, shifts: saved });
    expect(r.result).toContain(
      'CHANGED since the last rota: Tue 24 Nov 07:00–15:00 (8h) → now 09:00–17:00',
    );
    expect(r.result).toContain('REMOVED');
    expect(r.shifts).toHaveLength(3);
  });
});

describe('shift end times', () => {
  const s = { title: 'Early', start: '2026-11-20T07:00', end: '2026-11-20T15:00' };
  it('knows the shift under way, time left and home-by', () => {
    const at = new Date(2026, 10, 20, 12, 50);
    expect(currentShift([s], at)).toEqual(s);
    expect(currentShift([s], new Date(2026, 10, 20, 15, 0))).toBeNull();
    expect(timeLeft(s, at)).toBe('2h 10m');
    expect(timeLeft(s, new Date(2026, 10, 20, 14, 35))).toBe('25m');
    expect(homeBy(s, 25)).toBe('15:25');
    expect(homeBy(s, 0)).toBe('');
  });
});
