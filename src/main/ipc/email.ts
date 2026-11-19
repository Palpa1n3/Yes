import { app, safeStorage } from 'electron';
import { join } from 'node:path';
import { IPC } from '@shared/ipc';
import type { MainContext } from '../context';
import { EmailService, explainMailError, type Creds } from '../services/email';
import { openGmail } from '../services/gmail-imap';
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
    open: openGmail,
    getCreds,
    hasCreds: () => secret.has(),
    onChange: (s) => emit(ctx.getWindow(), IPC.email.onChange, s),
  });

  handle(IPC.email.state, () => email.get());
  handle(IPC.email.refresh, async () => {
    await email.refresh();
    return email.get();
  });
  handle(IPC.email.connect, async (rawUser, rawPass) => {
    const user = String(rawUser).trim();
    const pass = String(rawPass).replace(/\s+/g, '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user))
      return { ok: false, message: 'Enter your full email address.' };
    if (!/^[a-zA-Z]{16}$/.test(pass))
      return {
        ok: false,
        message: 'An app password is 16 letters (Google shows it in groups of four).',
      };
    try {
      const { unread } = await email.test({ user, pass });
      await secret.set(JSON.stringify({ user, pass }));
      await email.refresh();
      return { ok: true, message: `Connected. ${unread} unread in your inbox.` };
    } catch (err) {
      return { ok: false, message: explainMailError(err) };
    }
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
