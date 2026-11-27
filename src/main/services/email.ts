/** Any email provider over IMAP (Gmail, Yahoo, iCloud, BT, your own domain…; see
 *  shared/mail-servers.ts). Read-only: the inbox is opened read-only, so nothing is marked as
 *  read, moved or deleted. Credentials stay encrypted in main. */
import type { EmailState, EmailSummary } from '@shared/email';

export interface MailBackend {
  /** Unread count and the newest messages. */
  recent(limit: number): Promise<{ unread: number; items: EmailSummary[] }>;
  read(uid: number): Promise<{ from: string; subject: string; date: number; text: string } | null>;
  close(): Promise<void>;
}

export interface Creds {
  user: string;
  pass: string;
  /** The IMAP server that worked when connecting (absent: worked out from the address). */
  host?: string;
  port?: number;
  secure?: boolean;
  /** A local bridge app (Proton Mail Bridge) with its own certificate. */
  local?: boolean;
  provider?: string;
  webmail?: string;
}

export interface EmailDeps {
  open(c: Creds): Promise<MailBackend>;
  getCreds(): Promise<Creds | null>;
  hasCreds(): boolean;
  onChange(s: EmailState): void;
  now?: () => number;
}

export const REFRESH_MS = 5 * 60_000;

const errText = (err: unknown): string =>
  err instanceof Error
    ? `${err.message} ${(err as { responseText?: string }).responseText ?? ''}`
    : String(err);

/** The server answered but refused the address/password (so trying other servers won't help). */
export const isAuthError = (err: unknown): boolean =>
  /auth|credentials|invalid|AUTHENTICATIONFAILED|password|LOGIN failed/i.test(errText(err));

/** A plain reason for a failed connection. */
export function explainMailError(err: unknown, provider = 'Your email provider'): string {
  const m = errText(err);
  if (isAuthError(err))
    return `${provider} rejected the email address or password. Check both: many providers need an “app password” for mail apps rather than your normal one.`;
  if (/ECONNREFUSED/i.test(m) && /127\.0\.0\.1|localhost/i.test(m))
    return 'Couldn’t reach the mail bridge on this PC: is Proton Mail Bridge open?';
  if (/ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|network/i.test(m))
    return `Couldn't reach ${provider}. Check your internet connection (or the mail server name).`;
  return `Couldn't read email: ${m.slice(0, 120)}`;
}

export class EmailService {
  private state: EmailState = {
    configured: false,
    address: null,
    unread: 0,
    recent: [],
    fetchedAt: null,
    error: null,
  };
  private inflight: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly now: () => number;

  constructor(private readonly d: EmailDeps) {
    this.now = d.now ?? Date.now;
    this.state.configured = d.hasCreds();
  }

  get(): EmailState {
    return structuredClone(this.state);
  }

  /** Log in once to prove the details work (used before saving them). */
  async test(c: Creds): Promise<{ unread: number }> {
    const b = await this.d.open(c);
    try {
      const r = await b.recent(1);
      return { unread: r.unread };
    } finally {
      await b.close().catch(() => undefined);
    }
  }

  refresh(): Promise<void> {
    this.inflight ??= (async () => {
      const creds = await this.d.getCreds().catch(() => null);
      if (!creds) {
        this.state = {
          configured: false,
          address: null,
          unread: 0,
          recent: [],
          fetchedAt: null,
          error: null,
        };
        return;
      }
      let b: MailBackend | null = null;
      try {
        b = await this.d.open(creds);
        const r = await b.recent(15);
        this.state = {
          configured: true,
          address: creds.user,
          provider: creds.provider ?? null,
          webmail: creds.webmail ?? null,
          unread: r.unread,
          recent: r.items,
          fetchedAt: this.now(),
          error: null,
        };
      } catch (err) {
        this.state = {
          ...this.state,
          configured: true,
          address: creds.user,
          error: explainMailError(err, creds.provider),
        };
      } finally {
        await b?.close().catch(() => undefined);
      }
    })().finally(() => {
      this.inflight = null;
      this.d.onChange(this.get());
    });
    return this.inflight;
  }

  /** One email's text (for Claude), trimmed. */
  async read(
    uid: number,
  ): Promise<{ from: string; subject: string; date: string; text: string } | { error: string }> {
    const creds = await this.d.getCreds().catch(() => null);
    if (!creds) return { error: 'Email is not connected (Settings › Connections › Email).' };
    let b: MailBackend | null = null;
    try {
      b = await this.d.open(creds);
      const m = await b.read(uid);
      if (!m) return { error: 'That email no longer exists.' };
      return {
        from: m.from,
        subject: m.subject,
        date: new Date(m.date).toLocaleString(),
        text: m.text.slice(0, 8000),
      };
    } catch (err) {
      return { error: explainMailError(err, creds.provider) };
    } finally {
      await b?.close().catch(() => undefined);
    }
  }

  forget(): void {
    this.state = {
      configured: false,
      address: null,
      unread: 0,
      recent: [],
      fetchedAt: null,
      error: null,
    };
    this.d.onChange(this.get());
  }

  start(): void {
    if (this.d.hasCreds()) void this.refresh();
    this.timer = setInterval(() => this.d.hasCreds() && void this.refresh(), REFRESH_MS);
    this.timer.unref?.();
  }

  stop(): void {
    clearInterval(this.timer);
  }
}
