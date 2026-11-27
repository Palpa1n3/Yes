/** Email (any provider over IMAP, read-only). */
export interface EmailSummary {
  uid: number;
  from: string;
  subject: string;
  date: number;
  unread: boolean;
}

export interface EmailState {
  configured: boolean;
  /** The connected address (shown to the user only). */
  address: string | null;
  /** e.g. "Gmail", "BT Mail", or the domain. */
  provider?: string | null;
  /** Where to read it in a browser. */
  webmail?: string | null;
  unread: number;
  /** Newest first. */
  recent: EmailSummary[];
  fetchedAt: number | null;
  error: string | null;
}

export interface EmailConnectResult {
  ok: boolean;
  message: string;
}

/** "Amazon.co.uk <shipment@amazon.co.uk>" → "Amazon.co.uk". */
export const senderName = (from: string): string =>
  from
    .replace(/\s*<[^>]*>\s*$/, '')
    .replace(/^"|"$/g, '')
    .trim() || from.replace(/[<>]/g, '');

/** For the briefing: "You have 4 unread emails, including Amazon and Mum." */
export function emailSentence(s: EmailState): string | null {
  if (!s.configured || s.error) return null;
  if (!s.unread) return 'No unread email.';
  const from = [...new Set(s.recent.filter((e) => e.unread).map((e) => senderName(e.from)))].slice(
    0,
    3,
  );
  return `You have ${s.unread} unread email${s.unread === 1 ? '' : 's'}${from.length ? `, including ${from.length > 1 ? `${from.slice(0, -1).join(', ')} and ${from.at(-1)}` : from[0]}` : ''}.`;
}
