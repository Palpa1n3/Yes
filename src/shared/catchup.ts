/** "While you were away": a short catch-up when the PC starts, wakes or is unlocked (and on
 *  the phone after 30+ minutes). Pure; tested in tests/catchup.test.ts. */
import { groupMessages, quickSummary, type PhoneMsg } from './messages';
import { paydayIn } from './desk';

export interface CatchupInput {
  /** How long the user was away (ms). */
  awayMs: number;
  /** Shortest absence worth a catch-up (default 15 min). */
  minAwayMs?: number;
  messages: PhoneMsg[];
  /** Timers / reminders that went off unseen (their labels). */
  missed: string[];
  rotaChanged: boolean;
  payday: { date: string; net: number } | null;
  now?: Date;
}

/** The spoken catch-up, or null when there's nothing new or they were only away briefly. */
export function buildCatchup(c: CatchupInput): string | null {
  if (c.awayMs < (c.minAwayMs ?? 15 * 60_000)) return null;
  const parts: string[] = [];
  if (c.messages.length) parts.push(quickSummary(groupMessages(c.messages)));
  if (c.missed.length)
    parts.push(
      c.missed.length === 1
        ? `A reminder went off: ${c.missed[0] || 'a timer'}.`
        : `${c.missed.length} reminders went off: ${c.missed.filter(Boolean).slice(0, 3).join(', ')}.`,
    );
  if (c.rotaChanged) parts.push('Your rota changed: check the shifts.');
  if (c.payday) {
    const p = paydayIn(c.payday.date, c.now ?? new Date());
    if (p === 'Payday today' || p === 'Payday tomorrow')
      parts.push(`${p}${c.payday.net > 0 ? `, about £${Math.round(c.payday.net)}` : ''}.`);
  }
  return parts.length ? `While you were away: ${parts.join(' ')}` : null;
}
