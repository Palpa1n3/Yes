import { describe, expect, it } from 'vitest';
import { androidEventLink, reminderIcs } from '@shared/phone';
import { runPhoneTool } from '../phone/src/tools';

const st = { people: [], memories: [], lists: [], country: '44', android: true };

describe('reminders that buzz the phone', () => {
  it('opens the Android calendar with the reminder filled in', () => {
    const l = androidEventLink('Call the bank; ask about card', 1000, 2000);
    expect(l).toContain('action=android.intent.action.INSERT');
    expect(l).toContain('l.beginTime=1000');
    expect(l).toContain('B.hasAlarm=true');
    expect(l).toContain('S.title=Call%20the%20bank%3B%20ask'); // semicolons in the title are escaped
  });
  it('makes a calendar file with an alert for other phones', () => {
    const ics = reminderIcs('Bins out', Date.UTC(2026, 10, 21, 18, 0), 10);
    expect(ics).toContain('SUMMARY:Bins out');
    expect(ics).toContain('TRIGGER:-PT10M');
  });
  it('the set_reminder tool gives a button and a reminder to list', () => {
    const d = new Date(Date.now() + 86_400_000);
    const p = (n: number) => String(n).padStart(2, '0');
    const when = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T18:00`;
    const r = runPhoneTool('set_reminder', { what: 'Call the bank', when }, st);
    expect(r.action?.href).toContain('intent:#Intent');
    expect(r.reminder?.what).toBe('Call the bank');
    const ios = runPhoneTool(
      'set_reminder',
      { what: 'Call the bank', when },
      { ...st, android: false },
    );
    expect(ios.action?.ics?.name).toBe('reminder.ics');
    expect(
      runPhoneTool('set_reminder', { what: 'x', when: '2020-01-01T10:00' }, st).result,
    ).toContain('passed');
  });
});
