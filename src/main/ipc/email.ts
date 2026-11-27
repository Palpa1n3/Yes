import { app, safeStorage } from 'electron';
import { join } from 'node:path';
import { IPC } from '@shared/ipc';
import type { MainContext } from '../context';
import { EmailService, explainMailError, isAuthError, type Creds } from '../services/email';
import { openImap } from '../services/gmail-imap';
import { mailServersFor, manualServer } from '@shared/mail-servers';
import { SecretStore } from '../services/secret-store';
import { emit, handle } from './handle';

export function registerEmailIpc(ctx: MainContext): EmailService {
  // Address + app password, encrypted together like the other keys.
  const secret = new SecretStore(join(app.getPath('userData'), 'email.bin'), safeStorage);
  const getCreds = async (): Promise<Creds | null> => {
    const raw = await secret.get();
    if (!raw) return null;
    try {
      const c = JSON.parse(raw) as Creds;
      return typeof c.user === 'string' && typeof c.pass === 'string' ? c : null;
    } catch {
      return null;
    }
  };
  const email = new EmailService({
    open: openImap,
    getCreds,
    hasCreds: () => secret.has(),
    onChange: (s) => emit(ctx.getWindow(), IPC.email.onChange, s),
  });

  handle(IPC.email.state, () => email.get());
  handle(IPC.email.refresh, async () => {
    await email.refresh();
    return email.get();
  });
  handle(IPC.email.connect, async (rawUser, rawPass, rawServer) => {
    const user = String(rawUser).trim();
    const pass = String(rawPass ?? '');
    const serverText = typeof rawServer === 'string' ? rawServer.trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user))
      return { ok: false, message: 'Enter your full email address.' };
    if (pass.trim().length < 4) return { ok: false, message: 'Enter the password for mail apps.' };
    // The provider's server, a server typed in by hand, or likely names for the domain.
    const manual = serverText ? manualServer(user, serverText) : null;
    if (serverText && !manual)
      return { ok: false, message: 'That mail server doesn’t look right (e.g. imap.example.com).' };
    const candidates = manual ? [manual] : mailServersFor(user);
    const first = candidates[0];
    if (!first) return { ok: false, message: 'Enter your full email address.' };
    if (first.passwordBlocked && !manual) return { ok: false, message: first.howTo };
    let lastErr: unknown = null;
    for (const s of candidates) {
      const creds: Creds = {
        user,
        pass,
        host: s.host,
        port: s.port,
        secure: s.secure,
        ...(s.local ? { local: true } : {}),
        provider: s.provider,
        webmail: s.webmail,
      };
      try {
        const { unread } = await email.test(creds);
        await secret.set(JSON.stringify(creds));
        await email.refresh();
        return {
          ok: true,
          message: `Connected to ${s.provider}${s.guess ? ` (${s.host})` : ''}. ${unread} unread in your inbox.`,
        };
      } catch (err) {
        lastErr = err;
        // The server answered and refused the password: other servers won't do better.
        if (isAuthError(err)) break;
      }
    }
    return {
      ok: false,
      message: `${explainMailError(lastErr, first.guess ? undefined : first.provider)}${
        first.guess && !manual && !isAuthError(lastErr)
          ? ' Add your provider’s IMAP server in the box below (their help pages list it).'
          : ''
      }`,
    };
  });
  handle(IPC.email.disconnect, () => {
    secret.clear();
    email.forget();
    return email.get();
  });

  email.start();
  app.on('will-quit', () => email.stop());
  return email;
}
