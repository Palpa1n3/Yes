/** The real mail backend: imap.gmail.com, INBOX opened read-only. */
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { EmailSummary } from '@shared/email';
import type { Creds, MailBackend } from './email';

const addr = (a?: Array<{ name?: string; address?: string }>): string =>
  a?.[0] ? (a[0].name ? `${a[0].name} <${a[0].address ?? ''}>` : (a[0].address ?? '')) : '';

export async function openGmail(c: Creds): Promise<MailBackend> {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: c.user, pass: c.pass.replace(/\s+/g, '') },
    logger: false,
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
