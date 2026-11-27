import { describe, expect, it } from 'vitest';
import { mailServersFor, manualServer, signInHelp } from '@shared/mail-servers';

describe('the mail server for any address', () => {
  it('knows the big providers', () => {
    expect(mailServersFor('me@gmail.com')[0]).toMatchObject({ host: 'imap.gmail.com', port: 993 });
    expect(mailServersFor('Me@Yahoo.co.uk')[0]?.host).toBe('imap.mail.yahoo.com');
    expect(mailServersFor('me@icloud.com')[0]?.host).toBe('imap.mail.me.com');
    expect(mailServersFor('me@btinternet.com')[0]?.provider).toBe('BT Mail');
    expect(mailServersFor('me@sky.com')[0]?.host).toBe('imap.tools.sky.com');
    expect(mailServersFor('me@proton.me')[0]).toMatchObject({
      host: '127.0.0.1',
      port: 1143,
      local: true,
    });
  });

  it('is honest that Outlook.com needs Microsoft’s own sign-in', () => {
    expect(mailServersFor('me@hotmail.co.uk')[0]?.passwordBlocked).toBe(true);
    expect(signInHelp('me@outlook.com')).toMatch(/switched off password sign-in/);
  });

  it('guesses the usual names for any other domain', () => {
    expect(mailServersFor('jack@mybusiness.co.uk').map((s) => s.host)).toEqual([
      'imap.mybusiness.co.uk',
      'mail.mybusiness.co.uk',
      'mybusiness.co.uk',
    ]);
    expect(mailServersFor('not-an-address')).toEqual([]);
  });

  it('takes a server typed in by hand', () => {
    expect(manualServer('jack@mybusiness.co.uk', 'imap.host.example:143')).toMatchObject({
      host: 'imap.host.example',
      port: 143,
      secure: false,
    });
    expect(manualServer('a@b.com', 'imap.b.com')).toMatchObject({ port: 993, secure: true });
    expect(manualServer('a@b.com', 'not a server!')).toBeNull();
  });
});
