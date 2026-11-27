/** The real mail backend: any IMAP server (Gmail, Yahoo, iCloud, BT, your own domain…), with the
 *  INBOX opened read-only. The server comes from the saved details, or from the address. */
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { EmailSummary } from '@shared/email';
import { mailServersFor } from '@shared/mail-servers';
import type { Creds, MailBackend } from './email';

const addr = (a?: Array<{ name?: string; address?: string }>): string =>
  a?.[0] ? (a[0].name ? `${a[0].name} <${a[0].address ?? ''}>` : (a[0].address ?? '')) : '';

/** App passwords are often shown in groups ("abcd efgh ijkl mnop"); other passwords keep their
 *  spaces. */
export const cleanPassword = (p: string): string =>
  /^[a-zA-Z]{4}( [a-zA-Z]{4}){3}$/.test(p.trim()) ? p.replace(/\s+/g, '') : p;

export async function openImap(c: Creds): Promise<MailBackend> {
  const known = mailServersFor(c.user)[0];
  const host = c.host ?? known?.host;
  if (!host) throw new Error('No mail server for that address.');
  const port = c.port ?? known?.port ?? 993;
  const secure = c.secure ?? known?.secure ?? true;
  const local = c.local ?? known?.local ?? false;
  const client = new ImapFlow({
    host,
    port,
    secure,
    // Without TLS from the start, upgrade to it (STARTTLS) before signing in.
    ...(secure ? {} : { doSTARTTLS: true }),
    // A local bridge (Proton) uses its own certificate, only on this PC.
    ...(local ? { tls: { rejectUnauthorized: false } } : {}),
    auth: { user: c.user, pass: cleanPassword(c.pass) },
    logger: false,
    connectionTimeout: 20_000,
  });
  await client.connect();
  const lock = await client.getMailboxLock('INBOX', { readOnly: true });
  return {
    async recent(limit) {
      const res = await client.status('INBOX', { messages: true, unseen: true });
      const st = res || { messages: 0, unseen: 0 };
      const total = st.messages ?? 0;
      const items: EmailSummary[] = [];
      if (total > 0) {
        const from = Math.max(1, total - limit + 1);
        for await (const m of client.fetch(`${from}:*`, {
          envelope: true,
          flags: true,
          uid: true,
        })) {
          items.push({
            uid: m.uid,
            from: addr(m.envelope?.from),
            subject: (m.envelope?.subject ?? '(no subject)').slice(0, 200),
            date: m.envelope?.date ? new Date(m.envelope.date).getTime() : 0,
            unread: !(m.flags ?? new Set()).has('\\Seen'),
          });
        }
      }
      return { unread: st.unseen ?? 0, items: items.sort((a, b) => b.date - a.date) };
    },
    async read(uid) {
      const m = await client.fetchOne(String(uid), { source: true, envelope: true }, { uid: true });
      if (!m || !m.source) return null;
      const parsed = await simpleParser(m.source);
      const text = (parsed.text ?? '').replace(/\n{3,}/g, '\n\n').trim();
      return {
        from: parsed.from?.text ?? addr(m.envelope?.from),
        subject: parsed.subject ?? '(no subject)',
        date: parsed.date?.getTime() ?? 0,
        text: text || '(This email has no plain-text part.)',
      };
    },
    async close() {
      lock.release();
      await client.logout();
    },
  };
}

/** Kept for older callers. */
export const openGmail = openImap;
