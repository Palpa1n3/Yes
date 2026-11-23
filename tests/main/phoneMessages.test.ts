import { describe, expect, it, vi } from 'vitest';
import { PhoneMessages, type PhoneMessagesDeps } from '../../src/main/services/phone-messages';

const deps = (
  over: Partial<PhoneMessagesDeps> = {},
): PhoneMessagesDeps & { said: string[]; shown: string[] } => {
  const said: string[] = [];
  const shown: string[] = [];
  return {
    said,
    shown,
    settings: () => ({ speak: true, quietFrom: 0, quietTo: 0 }),
    busy: () => false,
    speak: (t) => said.push(t),
    show: (t, b) => shown.push(`${t}: ${b}`),
    ask: async () => true,
    autoSend: () => true,
    ...over,
  };
};
const msg = (p: Record<string, unknown>) => ({
  id: `k${Math.random()}`,
  app: 'WhatsApp',
  from: 'Will',
  chat: '',
  text: 'hi',
  at: Date.now(),
  canReply: true,
  fav: false,
  ...p,
});

describe('PC phone messages', () => {
  it('reads favourites straight away and batches the rest', () => {
    vi.useFakeTimers();
    const d = deps();
    const pm = new PhoneMessages(d);
    pm.add(msg({ from: 'Mum', text: 'call me', fav: true }));
    expect(d.said).toEqual(['Mum says: call me']);
    pm.add(msg({ from: 'Dave', chat: 'Saturday crew', text: 'who is driving' }));
    pm.add(msg({ from: 'Sam', chat: 'Saturday crew', text: 'not me' }));
    expect(d.said).toHaveLength(1);
    vi.advanceTimersByTime(31_000);
    expect(d.said[1]).toBe('2 messages: 2 in Saturday crew.');
    vi.useRealTimers();
  });
  it('only shows them while gaming or full-screen, and ignores repeats', () => {
    const d = deps({ busy: () => true });
    const pm = new PhoneMessages(d);
    const m = msg({ from: 'Will', text: 'your code is 123456', fav: true });
    pm.add(m);
    pm.add(m);
    expect(d.said).toEqual([]);
    expect(d.shown).toEqual(['Will: your code is [code hidden]']);
  });
  it('queues a reply for the phone and confirms it out loud', async () => {
    const d = deps();
    const pm = new PhoneMessages(d);
    pm.add(msg({ id: 'n1', from: 'Will', text: 'you coming out?', fav: true }));
    expect(await pm.reply('on my way')).toMatch(/^Sending to Will/);
    const [r] = pm.pending();
    expect(r).toMatchObject({ id: 'n1', to: 'Will', text: 'on my way' });
    pm.result(r?.rid ?? '', true);
    expect(d.said.at(-1)).toBe('Sent to Will.');
    expect(pm.pending()).toEqual([]);
  });
  it('asks first when the phone does not send messages by itself', async () => {
    const ask = vi.fn(async () => false);
    const pm = new PhoneMessages(deps({ autoSend: () => false, ask }));
    pm.add(msg({ id: 'n2', from: 'Will', fav: true }));
    expect(await pm.reply('ok')).toBe('Not sent: you said no.');
    expect(ask).toHaveBeenCalled();
    expect(pm.pending()).toEqual([]);
  });
});
