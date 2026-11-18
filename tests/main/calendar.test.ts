import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  agendaSentence,
  eventsOn,
  fmtTime,
  nextEvent,
  validCalendarUrl,
  type CalEvent,
} from '@shared/calendar';
import { DEFAULT_PERSONALITY } from '@shared/personalities';
import { buildBriefing } from '@shared/routines';
import type { ProviderChunk } from '@shared/types';
import { MockProvider } from '../../src/main/services/ai-provider';
import { calendarForModel, toIntent } from '../../src/main/services/anthropic-provider';
import { CalendarService, parseIcs } from '../../src/main/services/calendar';

const ICS = readFileSync(join(__dirname, '../fixtures/google.ics'), 'utf8');
const iso = (t: number): string => new Date(t).toISOString().slice(0, 16);

describe('parseIcs (Google format)', () => {
  const events = parseIcs(ICS, Date.UTC(2026, 10, 17), Date.UTC(2026, 11, 2));

  it('expands repeats, applies moves and skips, drops cancelled', () => {
    expect(events.map((e) => [iso(e.start), e.title])).toEqual([
      ['2026-11-18T09:00', 'Team stand-up'], // Europe/London = UTC in November
      ['2026-11-18T14:30', 'Dentist'],
      ['2026-11-20T00:00', "Mum's birthday"],
      ['2026-11-23T11:00', 'Team stand-up (moved)'],
      ['2026-11-30T09:00', 'Team stand-up'],
    ]);
    expect(events.some((e) => e.title === 'Gym')).toBe(false);
  });

  it('keeps locations, durations and all-day flags', () => {
    expect(events[1]).toMatchObject({ location: 'High Street Dental, Leeds', allDay: false });
    expect(events[1]!.end - events[1]!.start).toBe(30 * 60_000);
    expect(events[2]).toMatchObject({ allDay: true });
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });

  it('converts time zones (summer time in London is UTC+1)', () => {
    const summer = ICS.replace(
      'DTSTART;TZID=Europe/London:20261102T090000',
      'DTSTART;TZID=Europe/London:20260601T090000',
    ).replace(
      'DTEND;TZID=Europe/London:20261102T093000',
      'DTEND;TZID=Europe/London:20260601T093000',
    );
    const june = parseIcs(summer, Date.UTC(2026, 5, 1), Date.UTC(2026, 5, 2));
    expect(iso(june[0]!.start)).toBe('2026-06-01T08:00');
  });
});

describe('calendar helpers', () => {
  const at = (h: number, m = 0, day = 18): number => new Date(2026, 10, day, h, m).getTime();
  const ev = (title: string, s: number, e: number, allDay = false): CalEvent => ({
    id: title,
    title,
    start: s,
    end: e,
    allDay,
  });
  const list = [
    ev('Bins out', at(0), at(0, 0, 19), true),
    ev('Dentist', at(14, 30), at(15)),
    ev('Football', at(19), at(20, 30)),
    ev('Dinner', at(19, 0, 19), at(21, 0, 19)),
  ];

  it('finds today and the next event', () => {
    expect(eventsOn(list, at(12)).map((e) => e.title)).toEqual(['Bins out', 'Dentist', 'Football']);
    expect(nextEvent(list, at(15, 30))?.title).toBe('Football');
  });

  it('summarises the day for the briefing', () => {
    expect(agendaSentence(list, at(9))).toBe(
      `You have 3 things on today: Bins out, Dentist at ${fmtTime(at(14, 30))} and Football at ${fmtTime(at(19))}.`,
    );
    expect(agendaSentence(list, at(22))).toBe('You have one thing on today: Bins out.');
    expect(agendaSentence(list.slice(3), at(9))).toMatch(
      /clear today; next up is Dinner, tomorrow at/,
    );
    expect(agendaSentence([], at(9), true)).toBe('Calendar clear today.');
  });

  it('accepts only https calendar addresses', () => {
    expect(
      validCalendarUrl(
        'https://calendar.google.com/calendar/ical/me%40gmail.com/private-abc123/basic.ics',
      ),
    ).toMatch(/^https:/);
    expect(validCalendarUrl('webcal://example.com/cal.ics')).toBe('https://example.com/cal.ics');
    expect(validCalendarUrl('http://example.com/cal.ics')).toBeNull();
    expect(validCalendarUrl('https://calendar.google.com/calendar/u/0/r')).toBeNull();
    expect(validCalendarUrl('not a url')).toBeNull();
  });

  it('is in the briefing, Claude and the offline brain', async () => {
    const text = buildBriefing({
      now: at(9),
      personality: DEFAULT_PERSONALITY,
      userName: '',
      weather: null,
      weatherConfigured: true,
      timers: [],
      stats: null,
      calendar: list,
    });
    expect(text).toMatch(/3 things on today/);
    expect(toIntent('get_calendar', {})).toEqual({ local: 'get_calendar' });
    const model = calendarForModel(list, at(16)) as { events: Array<Record<string, unknown>> };
    expect(model.events.find((e) => e['title'] === 'Dentist')).toMatchObject({ finished: true });
    expect(model.events.find((e) => e['title'] === 'Football')).toMatchObject({
      start: fmtTime(at(19)),
    });

    const ask = async (q: string, events: CalEvent[] | null): Promise<string> => {
      const out: ProviderChunk[] = [];
      for await (const c of new MockProvider(undefined, undefined, undefined, () => events).send(
        [{ role: 'user', content: q }],
        { systemPrompt: '' },
      ))
        out.push(c);
      return out.map((c) => (c.type === 'text' ? c.delta : '')).join('');
    };
    expect(await ask("what's on today?", null)).toMatch(/Settings › General › Calendar/);
    expect(await ask('what is on my calendar', [])).toMatch(/clear today/);
  });
});

describe('CalendarService', () => {
  const NOW = Date.UTC(2026, 10, 18, 8, 0);
  const res = (status: number, text = '') => ({ ok: status < 400, status, text: async () => text });
  function svc(fetch: ReturnType<typeof vi.fn>, url: string | null = 'https://x/basic.ics') {
    let now = NOW;
    const reminders: Array<[string, number]> = [];
    const onChange = vi.fn();
    const s = new CalendarService({
      fetch: fetch as unknown as ConstructorParameters<typeof CalendarService>[0]['fetch'],
      getUrl: async () => url,
      hasUrl: () => url !== null,
      now: () => now,
      onChange,
      remindMinutes: () => 10,
      onReminder: (e, m) => reminders.push([e.title, m]),
    });
    return { s, reminders, onChange, tick: (ms: number) => (now += ms) };
  }

  it('loads events and explains bad addresses', async () => {
    const { s } = svc(vi.fn(async () => res(200, ICS)));
    expect((await s.load('https://x')).length).toBeGreaterThan(2);
    await expect(svc(vi.fn(async () => res(404))).s.load('u')).rejects.toThrow(
      /not valid any more/,
    );
    await expect(svc(vi.fn(async () => res(200, '<html>'))).s.load('u')).rejects.toThrow(
      /didn't return a calendar/,
    );
    await expect(
      svc(vi.fn(async () => Promise.reject(new Error('x')))).s.load('u'),
    ).rejects.toThrow(/internet/);
  });

  it('refreshes into state, and keeps the last events if offline', async () => {
    const fetch = vi.fn(async () => res(200, ICS));
    const { s, onChange } = svc(fetch);
    await s.refresh();
    expect(s.state()).toMatchObject({ configured: true, error: null, fetchedAt: NOW });
    expect(s.state().events[0]?.title).toBe('Team stand-up');
    fetch.mockRejectedValueOnce(new Error('offline'));
    await s.refresh();
    expect(s.state().error).toMatch(/internet/);
    expect(s.state().events.length).toBeGreaterThan(0);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(svc(vi.fn(), null).s.state()).toMatchObject({ configured: false, events: [] });
  });

  it('gives one heads-up per event, shortly before it starts', async () => {
    const { s, reminders, tick } = svc(vi.fn(async () => res(200, ICS)));
    await s.refresh();
    tick(50 * 60_000); // 08:50 UTC, stand-up at 09:00
    s.checkReminders();
    s.checkReminders();
    expect(reminders).toEqual([['Team stand-up', 10]]);
    tick(5 * 3600_000); // 13:50, dentist 14:30 → not yet
    s.checkReminders();
    expect(reminders).toHaveLength(1);
    tick(31 * 60_000); // 14:21
    s.checkReminders();
    expect(reminders.at(-1)).toEqual(['Dentist', 9]);
  });
});
