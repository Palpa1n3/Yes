/** The phone-only app (works with the PC off): the sync format shared with the PC, and the
 *  links that hand an action to the phone's own apps (Messages, WhatsApp, Phone, Mail,
 *  Maps, Calendar, Clock). Nothing here sends anything by itself: every action becomes a
 *  button the user taps, and then confirms in the app that opens. */

export interface PhoneMessage {
  role: 'user' | 'assistant';
  text: string;
  at: number;
  images?: string[];
  sources?: Array<{ url: string; title: string }>;
  /** Buttons that open the phone's apps (text, call, directions…). */
  actions?: PhoneAction[];
}

export interface PhoneAction {
  label: string;
  sub?: string;
  href?: string;
  /** Pick this person from the phone's contacts (no number known yet). */
  pickFor?: string;
  /** Share this text through the phone's share sheet. */
  share?: string;
  /** A calendar file to hand to the calendar app (or download). */
  ics?: { name: string; text: string };
  /** Shift keys to remember as added once this button is tapped. */
  marks?: string[];
  /** Say this out loud so a nearby Echo hears it ("set an alarm for 5:45 a.m."). */
  alexa?: string;
}

export interface PhoneChat {
  id: string;
  title: string;
  research: boolean;
  pinned?: boolean;
  updatedAt: number;
  messages: PhoneMessage[];
}

export interface Person {
  name: string;
  phone?: string;
  email?: string;
}

/** PC → phone (#sync=…): who Alton is and what it knows, plus recent chats. */
export interface SyncFromPc {
  v: 1;
  name: string;
  userName: string;
  systemPrompt: string;
  model: string;
  memories: string[];
  lists: Array<{ name: string; items: Array<{ text: string; done: boolean }> }>;
  chats: PhoneChat[];
  pcUrl: string;
  /** Network adapters' MAC addresses, for a Wake-on-LAN app. */
  macs: string[];
  /** Goals with progress, and quick notes (newest first). */
  goals?: Array<{ title: string; progress: number }>;
  notes?: string[];
  /** Saved prompts (/fix, /summarize...). */
  prompts?: Array<{ name: string; text: string }>;
  /** The PC's look: accent colour (#rrggbb) and avatar. */
  look?: { accent: string; avatar: string };
  at: number;
}

/** Phone → PC (#import=…): chats had on the phone and memories it learned. */
export interface SyncToPc {
  v: 1;
  chats: PhoneChat[];
  memories: string[];
  listItems: Array<{ list: string; text: string }>;
  /** Items ticked off or deleted on the phone. */
  listOps?: Array<{ list: string; text: string; op: 'done' | 'remove' }>;
  /** Quick notes written on the phone. */
  notes?: string[];
  /** Work shifts read from rotas on the phone. */
  shifts?: import('./shifts').Shift[];
}

/* ── Encoding for the URL fragment (never sent to any server) ─────────────── */

export function encodeSync(data: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeSync<T>(s: string): T | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

/** Merge chats: keep both sides, newest version of each chat wins. */
export function mergeChats(mine: PhoneChat[], theirs: PhoneChat[]): PhoneChat[] {
  const by = new Map(mine.map((c) => [c.id, c]));
  for (const c of theirs) {
    const m = by.get(c.id);
    if (!m || c.updatedAt >= m.updatedAt) by.set(c.id, c);
  }
  return [...by.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

/* ── People ───────────────────────────────────────────────────────────────── */

/** "07700 900123" → "+447700900123" (UK-style leading 0 + country code). */
export function toInternational(num: string, country = '44'): string {
  const t = num.replace(/[^\d+]/g, '');
  if (t.startsWith('+')) return t;
  if (t.startsWith('00')) return `+${t.slice(2)}`;
  if (t.startsWith('0')) return `+${country}${t.slice(1)}`;
  return t.length > 10 ? `+${t}` : t;
}

export const looksLikeNumber = (s: string): boolean =>
  /^\+?[\d\s()-]{6,}$/.test(s.trim()) && (s.match(/\d/g) ?? []).length >= 6;

export const looksLikeEmail = (s: string): boolean => /^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(s.trim());

/** Find who "Mum" / "Sarah" is: the People list first, then memories like "Mum's number is…". */
export function resolvePerson(
  who: string,
  people: Person[],
  memories: string[] = [],
): Person | null {
  const w = who.trim();
  if (!w) return null;
  if (looksLikeNumber(w)) return { name: w, phone: w };
  if (looksLikeEmail(w)) return { name: w, email: w };
  const l = w.toLowerCase().replace(/^(my|the)\s+/, '');
  const hit =
    people.find((p) => p.name.toLowerCase() === l) ??
    people.find((p) => p.name.toLowerCase().split(/\s+/)[0] === l) ??
    people.find((p) => p.name.toLowerCase().includes(l));
  if (hit) return hit;
  for (const m of memories) {
    const lower = m.toLowerCase();
    if (!lower.includes(l)) continue;
    const num = /(\+?\d[\d\s-]{8,}\d)/.exec(m)?.[1];
    const mail = /([\w.+-]+@[\w-]+\.[\w.-]+)/.exec(m)?.[1];
    if (num || mail)
      return { name: w, ...(num ? { phone: num } : {}), ...(mail ? { email: mail } : {}) };
  }
  return null;
}

/* ── Links that open the phone's apps ─────────────────────────────────────── */

const enc = encodeURIComponent;

export function smsLink(phone: string, body: string): string {
  // "?&body=" works on both iPhone and Android.
  return `sms:${phone.replace(/[^\d+]/g, '')}?&body=${enc(body)}`;
}

export function whatsappLink(phone: string, body: string, country = '44'): string {
  return `https://wa.me/${toInternational(phone, country).replace(/^\+/, '')}?text=${enc(body)}`;
}

export const callLink = (phone: string): string => `tel:${phone.replace(/[^\d+]/g, '')}`;

export function emailLink(to: string, subject: string, body: string): string {
  return `mailto:${enc(to).replace(/%40/g, '@')}?subject=${enc(subject)}&body=${enc(body)}`;
}

export function directionsLink(destination: string, mode = 'driving'): string {
  const m = ['driving', 'walking', 'transit', 'bicycling'].includes(mode) ? mode : 'driving';
  return `https://www.google.com/maps/dir/?api=1&destination=${enc(destination)}&travelmode=${m}`;
}

/** "2026-11-20T15:00" → "20261120T150000" (local time, as Google Calendar expects). */
function gcalTime(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(iso.trim());
  if (!m) return null;
  return m[4] ? `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}00` : `${m[1]}${m[2]}${m[3]}`;
}

export function calendarLink(e: {
  title: string;
  start: string;
  end?: string;
  location?: string;
  details?: string;
}): string | null {
  const s = gcalTime(e.start);
  if (!s) return null;
  let end = e.end ? gcalTime(e.end) : null;
  if (!end) {
    if (s.length === 8) end = s;
    else {
      const d = new Date(`${e.start.slice(0, 16)}:00`);
      d.setHours(d.getHours() + 1);
      const p = (n: number): string => String(n).padStart(2, '0');
      end = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
    }
  }
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${enc(e.title)}&dates=${s}/${end}${e.location ? `&location=${enc(e.location)}` : ''}${e.details ? `&details=${enc(e.details)}` : ''}`;
}

/** Android: start a countdown in the Clock app. (iPhone has no web link for this.) */
export function androidTimerLink(minutes: number, label = ''): string {
  const secs = Math.max(1, Math.round(minutes * 60));
  return `intent:#Intent;action=android.intent.action.SET_TIMER;i.android.intent.extra.alarm.LENGTH=${secs};S.android.intent.extra.alarm.MESSAGE=${enc(label || 'Alton timer')};B.android.intent.extra.alarm.SKIP_UI=false;end`;
}

/** Android: set an alarm in the Clock app for HH:MM. */
export function androidAlarmLink(hour: number, minute: number, label = ''): string {
  return `intent:#Intent;action=android.intent.action.SET_ALARM;i.android.intent.extra.alarm.HOUR=${Math.floor(hour)};i.android.intent.extra.alarm.MINUTES=${Math.floor(minute)};S.android.intent.extra.alarm.MESSAGE=${enc(label || 'Alton alarm')};end`;
}

type SyncList = { name: string; items: Array<{ text: string; done: boolean }> };

/** The PC's lists, with the phone's changes that haven't reached the PC yet put back on top
 *  (added items, ticks and deletions), so a sync never makes them vanish from the phone. */
export function mergeLists(
  pc: SyncList[],
  added: Array<{ list: string; text: string }>,
  ops: Array<{ list: string; text: string; op: 'done' | 'remove' }>,
): SyncList[] {
  const out = pc.map((l) => ({ name: l.name, items: l.items.map((i) => ({ ...i })) }));
  const find = (name: string): SyncList => {
    const l = out.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (l) return l;
    const n = { name, items: [] as SyncList['items'] };
    out.push(n);
    return n;
  };
  const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();
  for (const a of added) {
    const l = find(a.list || 'To-do');
    if (!l.items.some((i) => same(i.text, a.text))) l.items.push({ text: a.text, done: false });
  }
  for (const o of ops) {
    const lists = o.list ? out.filter((l) => same(l.name, o.list)) : out;
    for (const l of lists) {
      if (o.op === 'remove') l.items = l.items.filter((i) => !same(i.text, o.text));
      else for (const i of l.items) if (same(i.text, o.text)) i.done = true;
    }
  }
  return out;
}
