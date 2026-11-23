/** Phone messages (from the phone's notifications): how they're read out, grouped and
 *  summarised, on the phone and on the PC. Pure; tested in tests/messages.test.ts.
 *  Never says one-time codes or passwords in full. */

export interface PhoneMsg {
  /** The notification's key (used to reply through it). */
  id: string;
  /** "WhatsApp", "Messages"… */
  app: string;
  /** Who sent it. */
  from: string;
  /** The group chat's name ('' for one-to-one). */
  chat: string;
  text: string;
  at: number;
  canReply: boolean;
}

const CODE_WORDS =
  /\b(code|otp|passcode|password|pin|verification|verify|2fa|one[- ]?time|security|login|sign[- ]?in|authenticat\w*)\b/i;

/** Hide one-time codes and passwords ("Your code is 482913" → "Your code is [code hidden]"). */
export function hideCodes(text: string): string {
  if (!CODE_WORDS.test(text)) return text;
  return text
    .replace(/\b(?=[A-Z0-9-]*\d)[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g, (m) =>
      /\d/.test(m) && m.replace(/-/g, '').length >= 4 ? '[code hidden]' : m,
    )
    .replace(/((?:password|passcode|pin)\s*(?:is|:)\s*)(\S+)/gi, '$1[hidden]');
}

/** Favourite people (by name, any case; "Mum" matches "Mum ❤️" and "mum"). */
export function isFavourite(m: Pick<PhoneMsg, 'from' | 'chat'>, favourites: string[]): boolean {
  if (m.chat) return false;
  const who = m.from
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .trim();
  return favourites.some((f) => {
    const k = f.toLowerCase().trim();
    return !!k && (who === k || who.startsWith(`${k} `) || who.split(' ').includes(k));
  });
}

/** Read out straight away (a favourite, one-to-one) or batch into a summary. */
export function announceRule(
  m: Pick<PhoneMsg, 'from' | 'chat'>,
  favourites: string[],
): 'now' | 'batch' {
  return isFavourite(m, favourites) ? 'now' : 'batch';
}

const ASKS =
  /\?|\b(can you|could you|are you|will you|would you|do you|did you|call me|ring me|let me know|you coming|what time|where are you|when are you|text me|get back to me)\b/i;
/** Does it look like it wants an answer? */
export const needsAnswer = (text: string): boolean => ASKS.test(text);

/** "Will says: you coming out?" / "Dave in Saturday crew says: …" */
export function spokenLine(m: PhoneMsg, max = 200): string {
  const t = hideCodes(m.text).replace(/\s+/g, ' ').trim();
  const said = t.length > max ? `${t.slice(0, max).replace(/\s+\S*$/, '')}…` : t;
  return `${m.from}${m.chat ? ` in ${m.chat}` : ''} says: ${said}`;
}

export interface MsgGroup {
  key: string;
  /** The person, or the group chat's name. */
  title: string;
  app: string;
  group: boolean;
  count: number;
  /** Newest first, codes hidden. */
  texts: string[];
  senders: string[];
  latestAt: number;
  needsAnswer: boolean;
  /** The newest message's id (to reply to). */
  replyId: string;
  canReply: boolean;
}

/** Group by person / chat, newest group first. */
export function groupMessages(msgs: PhoneMsg[]): MsgGroup[] {
  const by = new Map<string, MsgGroup>();
  for (const m of [...msgs].sort((a, b) => b.at - a.at)) {
    const key = `${m.app}|${m.chat || m.from}`.toLowerCase();
    let g = by.get(key);
    if (!g) {
      g = {
        key,
        title: m.chat || m.from,
        app: m.app,
        group: !!m.chat,
        count: 0,
        texts: [],
        senders: [],
        latestAt: m.at,
        needsAnswer: false,
        replyId: m.id,
        canReply: m.canReply,
      };
      by.set(key, g);
    }
    g.count++;
    if (g.texts.length < 5) g.texts.push(hideCodes(m.text).slice(0, 300));
    if (!g.senders.includes(m.from)) g.senders.push(m.from);
    if (!m.chat && needsAnswer(m.text)) g.needsAnswer = true;
  }
  return [...by.values()].sort((a, b) => b.latestAt - a.latestAt);
}

/** A quick spoken summary without AI: "6 messages: Will (asking something), Mum, 4 in Saturday crew." */
export function quickSummary(groups: MsgGroup[]): string {
  const total = groups.reduce((n, g) => n + g.count, 0);
  if (!total) return 'No new messages.';
  const parts = groups.slice(0, 5).map((g) => {
    const n = g.count > 1 ? `${g.count} ` : '';
    if (g.group) return `${n || '1 '}in ${g.title}`;
    return `${g.count > 1 ? `${g.count} from ` : ''}${g.title}${g.needsAnswer ? ' (asking something)' : ''}`;
  });
  if (groups.length > 5) parts.push(`${groups.length - 5} more chats`);
  return `${total} message${total === 1 ? '' : 's'}: ${parts.join(', ')}.`;
}

/** The messages for Claude to summarise in a sentence: grouped, newest first, codes hidden. */
export function digestForAi(groups: MsgGroup[], now = Date.now()): string {
  if (!groups.length) return 'No new messages.';
  const ago = (t: number): string => {
    const m = Math.round((now - t) / 60_000);
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
  };
  return groups
    .slice(0, 12)
    .map(
      (g) =>
        `${g.group ? `Group "${g.title}"` : g.title} (${g.app}, ${g.count} message${g.count > 1 ? 's' : ''}, latest ${ago(g.latestAt)}${g.needsAnswer ? ', NEEDS AN ANSWER' : ''}${g.canReply ? `, reply id ${g.replyId}` : ''}): ${g.texts
          .slice(0, 3)
          .map((t) => `"${t.slice(0, 160)}"`)
          .join(' / ')}`,
    )
    .join('\n');
}

/** Hour h is in quiet hours from–to (wrapping past midnight). */
export function inQuietHours(h: number, from: number, to: number): boolean {
  if (from === to) return false;
  return from < to ? h >= from && h < to : h >= from || h < to;
}
