import { describe, expect, it } from 'vitest';
import {
  announceRule,
  digestForAi,
  groupMessages,
  hideCodes,
  inQuietHours,
  isFavourite,
  needsAnswer,
  quickSummary,
  spokenLine,
  type PhoneMsg,
} from '@shared/messages';

const m = (p: Partial<PhoneMsg>): PhoneMsg => ({
  id: p.id ?? Math.random().toString(),
  app: 'WhatsApp',
  from: 'Will',
  chat: '',
  text: 'hi',
  at: 1000,
  canReply: true,
  ...p,
});

describe('hiding codes', () => {
  it('hides one-time codes and passwords but leaves normal messages alone', () => {
    expect(hideCodes('Your Monzo code is 482913. Never share it.')).toBe(
      'Your Monzo code is [code hidden]. Never share it.',
    );
    expect(hideCodes('Use G-482913 to verify your account')).toBe(
      'Use [code hidden] to verify your account',
    );
    expect(hideCodes('Your password is hunter2')).toBe('Your password is [hidden]');
    expect(hideCodes('See you at 7, bring 2 chairs')).toBe('See you at 7, bring 2 chairs');
    expect(hideCodes('Meet at 1800 by the pitch')).toBe('Meet at 1800 by the pitch');
  });
});

describe('who gets read out', () => {
  it('reads favourites straight away and batches everyone else and groups', () => {
    const favs = ['Will', 'Mum'];
    expect(isFavourite(m({ from: 'Mum ❤️' }), favs)).toBe(true);
    expect(isFavourite(m({ from: 'will' }), favs)).toBe(true);
    expect(isFavourite(m({ from: 'Willow' }), favs)).toBe(false);
    expect(announceRule(m({ from: 'Will' }), favs)).toBe('now');
    expect(announceRule(m({ from: 'Will', chat: 'Saturday crew' }), favs)).toBe('batch');
    expect(announceRule(m({ from: 'Dave' }), favs)).toBe('batch');
  });
  it('says who and what, with codes hidden', () => {
    expect(spokenLine(m({ text: 'you coming out?' }))).toBe('Will says: you coming out?');
    expect(spokenLine(m({ from: 'Dave', chat: 'Saturday crew', text: 'kick off 3pm' }))).toBe(
      'Dave in Saturday crew says: kick off 3pm',
    );
    expect(spokenLine(m({ from: 'Bank', text: 'Your code is 123456' }))).toBe(
      'Bank says: Your code is [code hidden]',
    );
  });
  it('knows quiet hours across midnight', () => {
    expect(inQuietHours(23, 22, 7)).toBe(true);
    expect(inQuietHours(6, 22, 7)).toBe(true);
    expect(inQuietHours(12, 22, 7)).toBe(false);
    expect(inQuietHours(12, 0, 0)).toBe(false);
  });
});

describe('grouping and summaries', () => {
  const msgs = [
    m({ from: 'Will', text: 'you coming out tonight?', at: 6000 }),
    m({ from: 'Mum', text: 'call me when you can', at: 5000, app: 'Messages' }),
    m({ from: 'Dave', chat: 'Saturday crew', text: 'who is driving', at: 4000 }),
    m({ from: 'Sam', chat: 'Saturday crew', text: 'not me', at: 3000 }),
    m({ from: 'Dave', chat: 'Saturday crew', text: 'ok I will', at: 2000 }),
    m({ from: 'Jo', chat: 'Saturday crew', text: '👍', at: 1000 }),
  ];
  it('groups by person or chat, newest first, and spots questions', () => {
    const g = groupMessages(msgs);
    expect(g.map((x) => [x.title, x.count])).toEqual([
      ['Will', 1],
      ['Mum', 1],
      ['Saturday crew', 4],
    ]);
    expect(g[0]?.needsAnswer).toBe(true);
    expect(g[1]?.needsAnswer).toBe(true);
    expect(g[2]?.senders).toEqual(['Dave', 'Sam', 'Jo']);
    expect(needsAnswer('ok cool')).toBe(false);
  });
  it('summarises without AI and prepares a digest for Claude', () => {
    const g = groupMessages(msgs);
    expect(quickSummary(g)).toBe(
      '6 messages: Will (asking something), Mum (asking something), 4 in Saturday crew.',
    );
    expect(quickSummary([])).toBe('No new messages.');
    const d = digestForAi(g, 7000);
    expect(d.split('\n')[0]).toContain(
      'Will (WhatsApp, 1 message, latest just now, NEEDS AN ANSWER',
    );
    expect(d).toContain('Group "Saturday crew"');
  });
});
