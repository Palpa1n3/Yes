import { describe, expect, it, vi } from 'vitest';
import { emailSentence, senderName, type EmailState, type EmailSummary } from '@shared/email';
import { buildBriefing } from '@shared/routines';
import { DEFAULT_PERSONALITY } from '@shared/personalities';
import type { ProviderChunk } from '@shared/types';
import { MockProvider } from '../../src/main/services/ai-provider';
import { toIntent } from '../../src/main/services/anthropic-provider';
import { EmailService, explainMailError, type MailBackend } from '../../src/main/services/email';

const mails: EmailSummary[] = [
  {
    uid: 3,
    from: 'Amazon.co.uk <shipment@amazon.co.uk>',
    subject: 'Your parcel is on its way',
    date: 3000,
    unread: true,
  },
  { uid: 2, from: '"Mum" <mum@example.com>', subject: 'Sunday dinner?', date: 2000, unread: true },
  { uid: 1, from: 'news@example.com', subject: 'Weekly digest', date: 1000, unread: false },
];

function service(opts: { fail?: Error; creds?: boolean } = {}) {
  const backend: MailBackend = {
    recent: vi.fn(async () => ({ unread: 2, items: mails })),
    read: vi.fn(async (uid: number) =>
      uid === 2
        ? { from: 'Mum', subject: 'Sunday dinner?', date: 2000, text: 'Roast at 2?' }
        : null,
    ),
    close: vi.fn(async () => undefined),
  };
  const open = vi.fn(async () => {
    if (opts.fail) throw opts.fail;
    return backend;
  });
  const onChange = vi.fn();
  const has = opts.creds ?? true;
  const svc = new EmailService({
    open,
    getCreds: async () => (has ? { user: 'me@gmail.com', pass: 'abcdabcdabcdabcd' } : null),
    hasCreds: () => has,
    onChange,
    now: () => 42,
  });
  return { svc, backend, open, onChange };
}

describe('email', () => {
  it('summarises senders for the briefing', () => {
    expect(senderName('Amazon.co.uk <shipment@amazon.co.uk>')).toBe('Amazon.co.uk');
    expect(senderName('"Mum" <mum@example.com>')).toBe('Mum');
    const st: EmailState = {
      configured: true,
      address: 'x',
      unread: 2,
      recent: mails,
      fetchedAt: 1,
      error: null,
    };
    expect(emailSentence(st)).toBe('You have 2 unread emails, including Amazon.co.uk and Mum.');
    expect(emailSentence({ ...st, unread: 0 })).toBe('No unread email.');
    expect(emailSentence({ ...st, configured: false })).toBeNull();
    const brief = buildBriefing({
      now: Date.now(),
      personality: DEFAULT_PERSONALITY,
      userName: '',
      weather: null,
      weatherConfigured: true,
      timers: [],
      stats: null,
      email: emailSentence(st),
    });
    expect(brief).toMatch(/2 unread emails/);
  });

  it('refreshes the inbox and always logs out', async () => {
    const { svc, backend, onChange } = service();
    await svc.refresh();
    expect(svc.get()).toMatchObject({
      configured: true,
      address: 'me@gmail.com',
      unread: 2,
      fetchedAt: 42,
      error: null,
    });
    expect(backend.close).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(await svc.read(2)).toMatchObject({ subject: 'Sunday dinner?', text: 'Roast at 2?' });
    expect(await svc.read(99)).toEqual({ error: 'That email no longer exists.' });
  });

  it('explains login and network problems plainly', async () => {
    const { svc } = service({
      fail: new Error('Command failed: AUTHENTICATIONFAILED Invalid credentials'),
    });
    await svc.refresh();
    expect(svc.get().error).toMatch(/rejected the email address or app password/);
    expect(explainMailError(new Error('getaddrinfo ENOTFOUND imap.gmail.com'))).toMatch(/internet/);
    expect(await service({ creds: false }).svc.read(1)).toEqual({
      error: expect.stringMatching(/not connected/),
    });
  });

  it('is offered to Claude and the offline brain', async () => {
    expect(toIntent('get_emails', {})).toEqual({ local: 'email' });
    expect(toIntent('read_email', { uid: 2 })).toEqual({ local: 'email' });
    const { svc } = service();
    await svc.refresh();
    const ask = async (st: EmailState | null): Promise<string> => {
      const out: ProviderChunk[] = [];
      for await (const c of new MockProvider(
        undefined,
        undefined,
        undefined,
        undefined,
        null,
        () => null,
        null,
        () => st,
      ).send([{ role: 'user', content: 'any new emails?' }], { systemPrompt: '' }))
        out.push(c);
      return out.map((c) => (c.type === 'text' ? c.delta : '')).join('');
    };
    expect(await ask(svc.get())).toMatch(
      /2 unread emails.*newest is “Your parcel is on its way” from Amazon\.co\.uk/,
    );
    expect(await ask(null)).toMatch(/isn’t connected/);
  });
});
