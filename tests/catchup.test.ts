import { describe, expect, it } from 'vitest';
import { buildCatchup } from '@shared/catchup';

const now = new Date(2026, 10, 24, 9, 0);
const msg = (from: string, text: string, chat = '') => ({
  id: from + text,
  app: 'WhatsApp',
  from,
  chat,
  text,
  at: now.getTime() - 60_000,
  canReply: true,
});

describe('while you were away', () => {
  it('skips short absences and quiet ones', () => {
    expect(
      buildCatchup({
        awayMs: 5 * 60_000,
        messages: [msg('Will', 'hi?')],
        missed: [],
        rotaChanged: false,
        payday: null,
        now,
      }),
    ).toBeNull();
    expect(
      buildCatchup({
        awayMs: 3_600_000,
        messages: [],
        missed: [],
        rotaChanged: false,
        payday: null,
        now,
      }),
    ).toBeNull();
  });
  it('sums up messages, missed reminders, rota changes and payday', () => {
    const line = buildCatchup({
      awayMs: 2 * 3_600_000,
      messages: [msg('Will', 'you coming out?'), msg('Dave', 'kick off 3', 'Saturday crew')],
      missed: ['Pasta'],
      rotaChanged: true,
      payday: { date: '2026-11-25', net: 292.6 },
      now,
    });
    expect(line).toBe(
      'While you were away: 2 messages: Will (asking something), 1 in Saturday crew. A reminder went off: Pasta. Your rota changed: check the shifts. Payday tomorrow, about £293.',
    );
  });
  it('leaves out a payday that is still days away', () => {
    expect(
      buildCatchup({
        awayMs: 3_600_000,
        messages: [],
        missed: [],
        rotaChanged: false,
        payday: { date: '2026-11-30', net: 100 },
        now,
      }),
    ).toBeNull();
  });
});
