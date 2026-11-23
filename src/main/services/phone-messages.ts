/** Phone messages on the PC: the phone sends each new message here (POST /api/phone-messages).
 *  At the desk Alton reads them out in its voice: favourites word for word, everyone else in a
 *  summary at most every 10 minutes; quiet in quiet hours; while gaming or with a full-screen
 *  app it only shows them (holo notification, desktop widget). Replies typed or said on the PC
 *  wait here until the phone collects them (GET /api/phone-replies) and sends them through the
 *  message's own notification. Kept in memory only. */
import {
  groupMessages,
  hideCodes,
  inQuietHours,
  quickSummary,
  spokenLine,
  type PhoneMsg,
} from '@shared/messages';

export interface PhoneMessagesDeps {
  settings(): { speak: boolean; quietFrom: number; quietTo: number };
  /** Gaming mode or a full-screen app in front: show, don't speak. */
  busy(): boolean;
  speak(text: string): void;
  show(title: string, body: string): void;
  /** Ask before sending (when the phone's "Send messages by themselves" is off). */
  ask(title: string, detail: string): Promise<boolean>;
  autoSend(): boolean;
}

interface Reply {
  rid: string;
  id: string;
  to: string;
  text: string;
  at: number;
}

const BATCH_GAP = 10 * 60_000;

export class PhoneMessages {
  private msgs: Array<PhoneMsg & { fav: boolean }> = [];
  private batch: PhoneMsg[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSummary = 0;
  private replies: Reply[] = [];
  private seq = 0;
  /** The last message read out (what "reply: …" answers). */
  last: PhoneMsg | null = null;

  constructor(private readonly d: PhoneMessagesDeps) {}

  /** A message from the phone (already checked to come from a paired phone). */
  add(raw: unknown): PhoneMsg | null {
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const s = (k: string, max: number): string =>
      typeof o[k] === 'string' ? (o[k] as string).trim().slice(0, max) : '';
    const m = {
      id: s('id', 300),
      app: s('app', 40) || 'Phone',
      from: s('from', 80),
      chat: s('chat', 80),
      text: s('text', 2000),
      at: typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : Date.now(),
      canReply: o.canReply === true,
      fav: o.fav === true,
    };
    if (!m.from || !m.text) return null;
    // The same notification updated with the same text: not a new message.
    if (this.msgs.some((x) => x.id === m.id && x.text === m.text)) return null;
    this.msgs = [...this.msgs, m].slice(-200);
    this.announce(m);
    return m;
  }

  private announce(m: PhoneMsg & { fav: boolean }): void {
    const st = this.d.settings();
    const quiet = inQuietHours(new Date().getHours(), st.quietFrom, st.quietTo);
    if (this.d.busy() || !st.speak || quiet) {
      this.d.show(`${m.from}${m.chat ? ` · ${m.chat}` : ''}`, hideCodes(m.text).slice(0, 200));
      return;
    }
    if (m.fav && !m.chat) {
      this.last = m;
      this.d.speak(spokenLine(m));
      return;
    }
    this.batch.push(m);
    if (this.batchTimer) return;
    const wait = Math.max(30_000, this.lastSummary + BATCH_GAP - Date.now());
    this.batchTimer = setTimeout(() => this.flush(), wait);
    this.batchTimer.unref?.();
  }

  private flush(): void {
    this.batchTimer = null;
    const list = this.batch;
    this.batch = [];
    if (!list.length) return;
    this.lastSummary = Date.now();
    const st = this.d.settings();
    if (this.d.busy() || !st.speak || inQuietHours(new Date().getHours(), st.quietFrom, st.quietTo))
      return;
    const groups = groupMessages(list);
    // One person: say it; several: summarise.
    const only =
      groups.length === 1 && groups[0] && !groups[0].group ? list[list.length - 1] : null;
    if (only) this.last = only;
    else this.last = list.filter((x) => x.canReply).pop() ?? null;
    this.d.speak(only ? spokenLine(only) : quickSummary(groups));
  }

  /** Messages since a time (for summaries and "while you were away"). */
  since(t: number): PhoneMsg[] {
    return this.msgs.filter((m) => m.at >= t);
  }

  latest(): PhoneMsg | null {
    return this.msgs[this.msgs.length - 1] ?? null;
  }

  /** A reply from the PC ("reply: on my way"), to the last message read out, or one by id or
   *  person. Asks first unless the phone sends messages by themselves. */
  async reply(text: string, target?: string): Promise<string> {
    const t = text.trim().slice(0, 1000);
    if (!t) return 'Nothing to send.';
    const pick =
      (target &&
        this.msgs
          .filter(
            (m) =>
              m.id === target ||
              m.from.toLowerCase() === target.toLowerCase() ||
              m.chat.toLowerCase() === target.toLowerCase(),
          )
          .pop()) ||
      this.last ||
      this.msgs.filter((m) => m.canReply).pop();
    if (!pick) return 'There is no phone message to reply to.';
    if (!pick.canReply)
      return `${pick.app} doesn't allow replies from its notification. Reply on the phone.`;
    const to = pick.chat || pick.from;
    if (!this.d.autoSend() && !(await this.d.ask(`Reply to ${to}?`, t)))
      return 'Not sent: you said no.';
    this.replies.push({ rid: `r${++this.seq}`, id: pick.id, to, text: t, at: Date.now() });
    return `Sending to ${to} through your phone. I'll say when it's sent.`;
  }

  /** For the phone: replies waiting (dropped after 10 minutes). */
  pending(): Array<{ rid: string; id: string; to: string; text: string }> {
    this.replies = this.replies.filter((r) => Date.now() - r.at < 10 * 60_000);
    return this.replies.map(({ rid, id, to, text }) => ({ rid, id, to, text }));
  }

  /** The phone tried to send a reply. */
  result(rid: string, ok: boolean, error?: string): void {
    const r = this.replies.find((x) => x.rid === rid);
    if (!r) return;
    this.replies = this.replies.filter((x) => x !== r);
    const line = ok
      ? `Sent to ${r.to}.`
      : `Couldn't send to ${r.to}: ${error ?? 'the phone said no'}.`;
    this.d.show(ok ? 'Reply sent' : 'Reply not sent', line);
    if (!this.d.busy() && this.d.settings().speak) this.d.speak(line);
  }
}

let instance: PhoneMessages | null = null;
export const phoneMessages = (): PhoneMessages | null => instance;
export function startPhoneMessages(d: PhoneMessagesDeps): PhoneMessages {
  instance = new PhoneMessages(d);
  return instance;
}
