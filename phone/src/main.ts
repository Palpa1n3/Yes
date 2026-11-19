/** Alton on the phone, without the PC: talks to Claude directly with the key saved on this
 *  phone. Chats, people and lists live in this browser; memories and chats sync with the PC
 *  through links (nothing goes through any other server). */
import Anthropic from '@anthropic-ai/sdk';
import {
  androidAlarmLink,
  decodeSync,
  encodeSync,
  mergeChats,
  type Person,
  type PhoneAction,
  type PhoneChat,
  type PhoneMessage,
  type SyncFromPc,
  type SyncToPc,
} from '@shared/phone';
import { md, plain } from './md';
import {
  alarmFor,
  describeShift,
  currentShift,
  formatAlarmRules,
  homeBy,
  timeLeft,
  leaveBy,
  replaceRota,
  nextShift,
  parseAlarmRules,
  shiftKey,
  spokenTime,
  upcomingShifts,
  weekHours,
  weekPay,
  type Shift,
  type ShiftAlarmRule,
} from '@shared/shifts';
import {
  addUsage,
  budgetCrossed,
  costOf,
  fmtUsd,
  spendLevel,
  summarise,
  type DayUsage,
} from '@shared/usage';
import { PHONE_TOOLS, nearbyLink, runPhoneTool, weatherSummary } from './tools';
import {
  DEFAULT_PROMPTS,
  expandPrompt,
  matchPromptCommand,
  needsText,
  sanitizePrompts,
  type SavedPrompt,
} from '@shared/prompts';

/* ── State (this browser only) ── */
interface State {
  model: string;
  name: string;
  userName: string;
  systemPrompt: string;
  memories: string[];
  lists: SyncFromPc['lists'];
  chats: PhoneChat[];
  people: Person[];
  pcUrl: string;
  macs: string[];
  country: string;
  speak: boolean;
  autoSend: boolean;
  /** Learned on the phone, not yet sent to the PC. */
  newMemories: string[];
  newListItems: Array<{ list: string; text: string }>;
  lastPcSync: number;
  lastExport: number;
  /** Ticked off / deleted on the phone, not yet sent to the PC. */
  listOps: Array<{ list: string; text: string; op: 'done' | 'remove' }>;
  goals: Array<{ title: string; progress: number }>;
  notes: string[];
  newNotes: string[];
  /** Claude spending on this phone, per day. */
  usage: DayUsage[];
  /** Monthly limit in dollars for a warning (0 = none). */
  budget: number;
  /** Saved prompts from the PC (/fix, /summarize...). */
  prompts: SavedPrompt[];
  /** Chats with a message waiting for signal. */
  queue: string[];
  /** Saver mode: Haiku, a shorter history and fewer web searches. */
  saver: boolean;
  /** The PC's HTTPS address over Tailscale (tailscale serve), for automatic switching. */
  pcHttps: string;
  /** Open the full PC version automatically when the PC is on. */
  autoSwitch: boolean;
  /** App lock: salted SHA-256 of the PIN ('' = no lock). */
  pinHash: string;
  pinSalt: string;
  /** Shifts already put in the calendar (start/end keys), so they aren't added twice. */
  addedShifts: string[];
  /** Shifts read from rotas (upcoming and the last week). */
  shifts: Shift[];
  /** Wake-up alarm this long before a shift, unless a rule gives an exact time. */
  shiftLead: number;
  shiftRules: ShiftAlarmRule[];
  /** Shifts whose "tomorrow" card was closed. */
  shiftCardsDone: string[];
  /** Hourly pay (0 = don't show pay) and unpaid break per long shift, in minutes. */
  payRate: number;
  unpaidBreak: number;
  /** Minutes to get to work, for "leave by". */
  travel: number;
  /** Last backup saved, and when the reminder was last put off (ms). */
  lastBackup: number;
  backupSnooze: number;
}
const KEY = 'alton-phone-v1';
const DEFAULTS: State = {
  model: 'claude-haiku-5-5',
  name: 'Alton',
  userName: '',
  systemPrompt: '',
  memories: [],
  lists: [],
  chats: [],
  people: [],
  pcUrl: '',
  macs: [],
  country: '44',
  speak: false,
  autoSend: true,
  newMemories: [],
  newListItems: [],
  lastPcSync: 0,
  lastExport: 0,
  listOps: [],
  goals: [],
  notes: [],
  newNotes: [],
  usage: [],
  budget: 0,
  prompts: DEFAULT_PROMPTS,
  queue: [],
  saver: false,
  pcHttps: '',
  autoSwitch: true,
  pinHash: '',
  pinSalt: '',
  addedShifts: [],
  shifts: [],
  shiftLead: 90,
  shiftRules: [],
  shiftCardsDone: [],
  payRate: 0,
  unpaidBreak: 0,
  travel: 0,
  lastBackup: 0,
  backupSnooze: 0,
};
const ls = {
  get: (k: string): string | null => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string): void => {
    try {
      localStorage.setItem(k, v);
    } catch {
      toast('This phone’s storage is full; old chats may not be saved.');
    }
  },
  del: (k: string): void => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};
let S: State = { ...DEFAULTS, ...(JSON.parse(ls.get(KEY) ?? '{}') as Partial<State>) };
let apiKey = ls.get('alton-key') ?? '';
const save = (): void => ls.set(KEY, JSON.stringify(S));
let chatId: string | null = S.chats[0]?.id ?? null;
let research = false;
let busy: AbortController | null = null;
let pending: Array<{ data: string; thumb: string }> = [];
let view = 'chat';

/* ── DOM helpers ── */
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function toast(t: string): void {
  const x = $('toast');
  x.textContent = t;
  x.style.display = 'block';
  clearTimeout((toast as unknown as { t?: number }).t);
  (toast as unknown as { t?: number }).t = window.setTimeout(
    () => (x.style.display = 'none'),
    2600,
  );
}
const uid = (): string => `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const android = /android/i.test(navigator.userAgent);
const cleanTitle = (t: string): string => t.replace(/[*_`#]+/g, '').trim() || 'Chat';

/* ── Sync from the PC (#sync=…) ── */
function takeHash(): void {
  const h = location.hash;
  if (!h.startsWith('#sync=')) return;
  const d = decodeSync<SyncFromPc>(h.slice(6));
  history.replaceState(null, '', location.pathname + location.search);
  if (!d || d.v !== 1) return toast('That sync link was damaged. Try again from the PC.');
  S = {
    ...S,
    name: d.name || S.name,
    userName: d.userName || S.userName,
    systemPrompt: d.systemPrompt || S.systemPrompt,
    model: d.model || S.model,
    memories: [...new Set([...d.memories, ...S.newMemories])],
    lists: d.lists,
    chats: mergeChats(S.chats, d.chats),
    pcUrl: d.pcUrl || S.pcUrl,
    macs: d.macs?.length ? d.macs : S.macs,
    goals: d.goals ?? S.goals,
    notes: [...S.newNotes, ...(d.notes ?? S.notes)],
    prompts: d.prompts ? sanitizePrompts(d.prompts) : S.prompts,
    lastPcSync: Date.now(),
    // Opened from the PC's Tailscale HTTPS address: that's the one to check.
    pcHttps: /^https:\/\//.test(d.pcUrl) ? d.pcUrl.replace(/\/+$/, '') : S.pcHttps,
  };
  // Just came from the PC on purpose: don't switch straight back to it.
  stayPhone = true;
  save();
  toast(`Synced from your PC: ${d.memories.length} memories, ${d.chats.length} chats`);
}

/* ── Claude ── */
function systemText(): string {
  const now = new Date();
  const base =
    S.systemPrompt ||
    `You are ${S.name}, a friendly, capable personal assistant${S.userName ? ` for ${S.userName}` : ''}.`;
  return [
    base,
    `You are running in ${S.name}'s phone app. The user's PC may be off, so you cannot control the PC, its files or apps here (if they need that, say they can open the full version from the PC tab when the PC is on).`,
    'Ideas for improving Alton: when the user wishes you could do something, a request fails because you lack a feature, or they suggest an improvement, add a short specific idea to the list "Alton roadmap" with add_to_list (it syncs to the PC roadmap) and mention it briefly.',
    'Alexa: you cannot reach Alexa directly; tell_alexa makes the phone say a command out loud for a nearby Echo (e.g. turning alarms or lights on).',
    'Shifts: you cannot open or read other apps. To add work shifts to the calendar, the user shares a screenshot of their rota/shift app (screenshot it, then Share › Alton, or the camera button here); read it and use add_shifts. If they ask without a screenshot, tell them that in one or two short steps.',
    'On the phone you can get things ready with your tools: texts and WhatsApp messages, calls, emails, directions, places nearby, calendar events, timers/alarms (Android), sharing and links. Each becomes a button the user taps and then confirms; never say a message was sent or a call made. If you do not know who someone is, ask, or use the contact button. You can also check where the user is (get_location) and the local weather (get_weather).',
    'Write for a phone screen: short paragraphs, bullet points when useful. You can search the web when it helps.',
    `Current local date and time: ${now.toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })} (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`,
    shiftLine(),
    S.people.length ? `People the user has saved: ${S.people.map((p) => p.name).join(', ')}.` : '',
    S.memories.length
      ? `Things you know about the user:\n${S.memories.map((m) => `- ${m}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** The model to use now (Saver mode always uses Haiku). */
const model = (): string => (S.saver ? 'claude-haiku-5-5' : S.model);

function webTools(): Anthropic.Messages.ToolUnion[] {
  const n = S.saver ? (research ? 3 : 1) : research ? 8 : 3;
  return model() === 'claude-haiku-5-5'
    ? [
        { type: 'web_search_20250305', name: 'web_search', max_uses: n },
        ...(research
          ? [{ type: 'web_fetch_20250910' as const, name: 'web_fetch' as const, max_uses: 5 }]
          : []),
      ]
    : [
        { type: 'web_search_20260209', name: 'web_search', max_uses: n },
        ...(research
          ? [{ type: 'web_fetch_20260209' as const, name: 'web_fetch' as const, max_uses: 5 }]
          : []),
      ];
}

function buildHistory(chat: PhoneChat, images: string[]): Anthropic.MessageParam[] {
  // Saver mode sends less of the chat each time (the biggest cost in long chats).
  const msgs = chat.messages.slice(S.saver ? -10 : -30);
  return msgs.map((m, i) => {
    if (m.role === 'assistant') return { role: 'assistant', content: m.text || '…' };
    // "Brief me" is shown as typed but asks for the full briefing.
    if (m.text === 'Brief me') return { role: 'user', content: BRIEF };
    const last = i === msgs.length - 1;
    if (!last || !images.length) return { role: 'user', content: m.text };
    return {
      role: 'user',
      content: [
        ...images.map((data) => ({
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data },
        })),
        { type: 'text' as const, text: m.text },
      ],
    };
  });
}

async function ask(chat: PhoneChat, images: string[]): Promise<void> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  const messages = buildHistory(chat, images);
  const reply: PhoneMessage = {
    role: 'assistant',
    text: '',
    at: Date.now(),
    actions: [],
    sources: [],
  };
  chat.messages.push(reply);
  const ctrl = new AbortController();
  busy = ctrl;
  setSending(true);
  let activity = 'Thinking…';
  const live = (): void => renderMsgs(activity);
  try {
    for (let step = 0; step < 6; step++) {
      const stream = client.messages.stream(
        {
          model: model(),
          max_tokens: 16000,
          system: [{ type: 'text', text: systemText(), cache_control: { type: 'ephemeral' } }],
          tools: [...PHONE_TOOLS, ...webTools()],
          messages,
          thinking: { type: 'adaptive' },
          output_config: { effort: research ? 'medium' : 'low' },
        },
        { signal: ctrl.signal },
      );
      let base = reply.text;
      stream.on('text', (_d, snapshot) => {
        reply.text = (base ? `${base}\n\n` : '') + snapshot;
        activity = '';
        live();
      });
      stream.on('streamEvent', (ev) => {
        if (ev.type === 'content_block_start' && ev.content_block.type === 'server_tool_use') {
          activity =
            ev.content_block.name === 'web_fetch' ? 'Reading a page…' : 'Searching the web…';
          live();
        }
      });
      const msg = await stream.finalMessage();
      {
        const before = summarise(S.usage, S.budget).month;
        S.usage = addUsage(S.usage, costOf(model(), msg.usage), research ? 'research' : 'chat');
        const crossed = budgetCrossed(before, summarise(S.usage, S.budget).month, S.budget);
        renderSpend();
        if (crossed)
          toast(
            crossed === 100
              ? `You've reached this month's limit ($${S.budget}) on this phone.`
              : `80% of this month's limit used on this phone.`,
          );
      }
      base = reply.text;
      for (const b of msg.content)
        if (b.type === 'text' && b.citations)
          for (const c of b.citations)
            if ('url' in c && c.url && !reply.sources?.some((x) => x.url === c.url))
              reply.sources?.push({ url: c.url, title: ('title' in c && c.title) || c.url });
      messages.push({ role: 'assistant', content: msg.content });
      const uses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (msg.stop_reason === 'pause_turn') continue;
      if (!uses.length) break;
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const u of uses) {
        // Location and weather need the phone (and the internet), so they run here.
        const live2 = await placeTool(u.name, u.input);
        if (live2) {
          if (live2.action) reply.actions?.push(live2.action);
          results.push({ type: 'tool_result', tool_use_id: u.id, content: live2.result });
          continue;
        }
        const out = runPhoneTool(u.name, u.input, {
          people: S.people,
          memories: S.memories,
          lists: S.lists,
          country: S.country,
          android,
          addedShifts: S.addedShifts,
          shifts: S.shifts,
          payRate: S.payRate,
          unpaidBreak: S.unpaidBreak,
        });
        if (out.shifts?.length) S.shifts = replaceRota(S.shifts, out.shifts);
        if (out.action) reply.actions?.push(out.action);
        if (out.actions) reply.actions?.push(...out.actions);
        if (out.remember) {
          S.memories.push(out.remember);
          S.newMemories.push(out.remember);
        }
        if (out.person)
          S.people = [
            ...S.people.filter((p) => p.name.toLowerCase() !== out.person?.name.toLowerCase()),
            out.person,
          ];
        for (const li of out.listItems ?? []) {
          const l =
            S.lists.find((x) => x.name.toLowerCase() === li.list.toLowerCase()) ??
            (S.lists.push({ name: li.list, items: [] }), S.lists[S.lists.length - 1]);
          l?.items.push({ text: li.text, done: false });
          S.newListItems.push(li);
        }
        results.push({ type: 'tool_result', tool_use_id: u.id, content: out.result });
      }
      messages.push({ role: 'user', content: results });
      activity = 'Working on it…';
      live();
    }
  } catch (err) {
    if (!ctrl.signal.aborted) {
      const m = friendlyError(err);
      reply.text = `${reply.text}${reply.text ? '\n\n' : ''}_${m}_`;
    }
  } finally {
    busy = null;
    setSending(false);
    if (!reply.text && !reply.actions?.length) reply.text = '_(stopped)_';
    chat.updatedAt = Date.now();
    save();
    renderMsgs();
    if (handsFree) say(reply.text, true, () => handsFree && !busy && toggleMic());
    else say(reply.text);
  }
}

/** Plain-English errors for the common problems. */
function friendlyError(err: unknown): string {
  if (!navigator.onLine) return 'You’re offline. Check your signal or Wi-Fi and try again.';
  if (err instanceof Anthropic.AuthenticationError)
    return 'Your Claude key was rejected. Check it in Settings › Change API key.';
  if (err instanceof Anthropic.PermissionDeniedError)
    return 'Your Claude key isn’t allowed to use this model. Try another model in Settings.';
  if (err instanceof Anthropic.RateLimitError)
    return 'Too many requests for a moment. Wait a few seconds and try again.';
  if (err instanceof Anthropic.APIConnectionError)
    return 'Couldn’t reach Claude. Check your internet connection.';
  if (err instanceof Anthropic.APIError) {
    const text = err.message.toLowerCase();
    if (text.includes('credit'))
      return 'Your Anthropic account is out of credit. Top up at console.anthropic.com › Billing.';
    if (err.status === 529 || text.includes('overloaded'))
      return 'Claude is very busy right now. Try again in a minute.';
    if (err.status === 413 || text.includes('too large'))
      return 'That was too big to send (try fewer or smaller photos).';
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}

/* ── Location & weather ── */
let lastFix: { lat: number; lon: number; at: number } | null = null;
function locate(): Promise<{ lat: number; lon: number } | null> {
  if (lastFix && Date.now() - lastFix.at < 10 * 60_000) return Promise.resolve(lastFix);
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => {
        lastFix = { lat: p.coords.latitude, lon: p.coords.longitude, at: Date.now() };
        resolve(lastFix);
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 5 * 60_000 },
    ),
  );
}
async function placeTool(
  name: string,
  input: unknown,
): Promise<{ result: string; action?: PhoneAction } | null> {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  if (name === 'get_location') {
    const f = await locate();
    return {
      result: f
        ? `The user is at latitude ${f.lat.toFixed(4)}, longitude ${f.lon.toFixed(4)}. Use web search with these coordinates or the nearest town to answer local questions.`
        : 'Location is off or not allowed on this phone. Ask the user where they are.',
    };
  }
  if (name === 'find_nearby') {
    const q = String(o.query ?? '').slice(0, 100);
    const f = await locate();
    return {
      result: 'It is ready as a button that opens Google Maps around the user.',
      action: {
        label: `Find ${q} nearby`,
        sub: f ? 'Around you, in Google Maps' : 'In Google Maps',
        href: nearbyLink(q, f?.lat, f?.lon),
      },
    };
  }
  if (name === 'get_weather') {
    let lat: number | undefined;
    let lon: number | undefined;
    let where = 'where the user is';
    const place = String(o.place ?? '')
      .trim()
      .slice(0, 80);
    try {
      if (place) {
        const g = (await (
          await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(place)}`,
          )
        ).json()) as {
          results?: Array<{ latitude: number; longitude: number; name: string; country?: string }>;
        };
        const r = g.results?.[0];
        if (!r) return { result: `Couldn't find a place called ${place}.` };
        lat = r.latitude;
        lon = r.longitude;
        where = `${r.name}${r.country ? `, ${r.country}` : ''}`;
      } else {
        const f = await locate();
        if (!f) return { result: 'Location is off on this phone; ask the user which town.' };
        lat = f.lat;
        lon = f.lon;
      }
      const w = (await (
        await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3`,
        )
      ).json()) as Parameters<typeof weatherSummary>[0];
      return { result: `Weather for ${where}: ${weatherSummary(w)}` };
    } catch {
      return { result: 'The weather service could not be reached.' };
    }
  }
  return null;
}

/* ── Chat UI ── */
const chat = (): PhoneChat | undefined => S.chats.find((c) => c.id === chatId);

/** Take back the last question (and its answer). */
function takeLast(): PhoneMessage | null {
  const c = chat();
  if (!c || busy) return null;
  let i = -1;
  for (let k = c.messages.length - 1; k >= 0; k--)
    if (c.messages[k]?.role === 'user') {
      i = k;
      break;
    }
  const u = c.messages[i];
  if (!u) return null;
  c.messages = c.messages.slice(0, i);
  save();
  return u;
}
function regenerate(): void {
  const u = takeLast();
  if (u) send(u.text);
}
function editLast(): void {
  const u = takeLast();
  if (!u) return;
  renderMsgs();
  const ta = $<HTMLTextAreaElement>('msg');
  ta.value = u.text;
  ta.focus();
}

function newChat(r = false): PhoneChat {
  const c: PhoneChat = {
    id: uid(),
    title: 'New chat',
    research: r,
    updatedAt: Date.now(),
    messages: [],
  };
  S.chats.unshift(c);
  chatId = c.id;
  research = r;
  save();
  return c;
}

const BRIEF =
  'Give me my briefing: the date, the weather where I am today and the next couple of days (use get_weather), what is on my lists (get_lists), and one useful tip for the day. Keep it short and friendly.';

function send(text?: string, expanded = false, typed?: string): void {
  const ta = $<HTMLTextAreaElement>('msg');
  const t = (text ?? ta.value).trim();
  if ((!t && !pending.length) || busy) return;
  if (!apiKey) return toast('Add your Claude key in Settings first.');
  // "/fix some text": a saved prompt. With nothing after it, use what was copied.
  const pm = expanded ? null : matchPromptCommand(t, S.prompts);
  if (pm) {
    const go = (x: string): void => {
      if (needsText(pm.prompt) && !x.trim() && !pending.length) {
        ta.value = `/${pm.prompt.name} `;
        ta.focus();
        return toast(`Type or paste some text after /${pm.prompt.name}`);
      }
      send(expandPrompt(pm.prompt, x), true, `/${pm.prompt.name} ${x.trim()}`.trim());
    };
    hideSlash();
    if (pm.rest.trim() || !needsText(pm.prompt) || !navigator.clipboard?.readText)
      return go(pm.rest);
    ta.value = '';
    void navigator.clipboard
      .readText()
      .catch(() => '')
      .then(go);
    return;
  }
  ta.value = '';
  ta.style.height = 'auto';
  const c = chat() ?? newChat(research);
  const imgs = pending;
  pending = [];
  renderThumbs();
  c.messages.push({
    role: 'user',
    text: t || 'Please take a look at this.',
    at: Date.now(),
    images: imgs.map((i) => i.thumb),
  });
  if (c.title === 'New chat') c.title = (typed || t || 'Photo').slice(0, 50);
  c.research = research;
  c.updatedAt = Date.now();
  if (!navigator.onLine) {
    // No signal: keep it and send it when the phone is back online.
    if (!S.queue.includes(c.id)) S.queue.push(c.id);
    queuedImages.set(
      c.id,
      imgs.map((i) => i.data),
    );
    save();
    renderMsgs();
    return toast('No signal. I’ll send it as soon as you’re back online.');
  }
  save();
  renderMsgs('Thinking…');
  void ask(
    c,
    imgs.map((i) => i.data),
  );
}

const money = (n: number): string =>
  new Intl.NumberFormat(navigator.language || 'en-GB', {
    style: 'currency',
    currency: S.country === '1' ? 'USD' : S.country === '353' ? 'EUR' : 'GBP',
  }).format(n);

/* ── Alexa: the phone says the command out loud for a nearby Echo ── */
function tellAlexa(command: string): void {
  if (!('speechSynthesis' in window)) return toast('This phone can’t speak out loud.');
  speechSynthesis.cancel();
  const wake = new SpeechSynthesisUtterance('Alexa.');
  wake.rate = 0.95;
  wake.volume = 1;
  const rest = new SpeechSynthesisUtterance(command);
  rest.rate = 0.95;
  rest.volume = 1;
  // A short gap after the wake word so the Echo is listening before the command.
  wake.onend = () => setTimeout(() => speechSynthesis.speak(rest), 900);
  speechSynthesis.speak(wake);
  toast('Speaking to Alexa… keep the phone near your Echo, volume up.');
}

/** For Claude: the next shift (so "brief me" and "am I working?" just know). */
function shiftLine(): string {
  const cur = currentShift(S.shifts);
  const home = cur ? homeBy(cur, S.travel) : '';
  const now = cur
    ? `The user is at work now (${cur.title}), finishing at ${cur.end.slice(11, 16)} (${timeLeft(cur)} left)${home ? `, home about ${home}` : ''}. `
    : '';
  const n = nextShift(S.shifts, new Date(), 48);
  const rate =
    S.payRate > 0
      ? ` They earn ${money(S.payRate)} an hour${S.unpaidBreak ? ` with a ${S.unpaidBreak}-minute unpaid break on long shifts` : ''}.`
      : '';
  const travel = S.travel ? ` It takes them about ${S.travel} minutes to get to work.` : '';
  return n
    ? `${now}Next work shift: ${n.when === 'later' ? '' : `${n.when}, `}${describeShift(n.shift)} ${n.shift.title}. Mention it in briefings.${rate}${travel}`
    : S.shifts.length
      ? `${now}No other work shift in the next two days.${rate}`
      : '';
}

/* ── Backup: everything on this phone (except the Claude key) to a file, and back ── */
function backup(): void {
  const data = JSON.stringify({ app: 'alton-phone', v: 1, at: Date.now(), state: S });
  const file = new File([data], `alton-backup-${new Date().toISOString().slice(0, 10)}.json`, {
    type: 'application/json',
  });
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  S.lastBackup = Date.now();
  save();
  renderBackupNudge();
  toast('Backup saved to Downloads. Your Claude key isn’t in it.');
}

async function restore(f: File): Promise<void> {
  try {
    const raw = JSON.parse(await f.text()) as { app?: string; state?: Partial<State> };
    if (raw.app !== 'alton-phone' || !raw.state || typeof raw.state !== 'object')
      return toast('That isn’t an Alton backup file.');
    const st = raw.state;
    const n = Array.isArray(st.chats) ? st.chats.length : 0;
    if (!confirm(`Restore this backup (${n} chats)? It replaces what's on this phone now.`)) return;
    S = { ...DEFAULTS, ...st };
    save();
    chatId = S.chats[0]?.id ?? null;
    renderSettings();
    renderMsgs();
    toast('Restored.');
  } catch {
    toast('Couldn’t read that file.');
  }
}

/** Once a week (when there's something worth keeping), a nudge to save a backup. */
function renderBackupNudge(): void {
  const box = $('backupNudge');
  const week = 7 * 86_400_000;
  const worth = S.chats.length + S.shifts.length + S.people.length + S.memories.length >= 3;
  const due =
    worth && Date.now() - S.lastBackup > week && Date.now() - S.backupSnooze > 3 * 86_400_000;
  box.hidden = !due;
  box.textContent = '';
  if (!due) return;
  box.appendChild(
    el(
      'span',
      undefined,
      S.lastBackup ? 'It’s been a week since your last backup.' : 'You haven’t saved a backup yet.',
    ),
  );
  const go = el('button', 'btn acc', 'Save one');
  go.onclick = backup;
  const later = el('button', 'btn', 'Later');
  later.onclick = () => {
    S.backupSnooze = Date.now();
    save();
    renderBackupNudge();
  };
  box.append(go, later);
}

/* ── Tomorrow's shift: a card with the wake-up alarm and Alexa buttons ── */
function renderShiftCard(): void {
  const box = $('shiftCard');
  box.textContent = '';
  // At work now: when it ends, how long is left, and when you'll be home.
  const cur = currentShift(S.shifts);
  if (cur && !S.shiftCardsDone.includes(`now:${shiftKey(cur)}`)) {
    box.hidden = false;
    const head = el('div', 'sc-head');
    head.appendChild(el('b', undefined, `At work · ${cur.title}`));
    const x = el('button', 'x', '✕');
    x.setAttribute('aria-label', 'Hide');
    x.onclick = () => {
      S.shiftCardsDone = [...S.shiftCardsDone, `now:${shiftKey(cur)}`].slice(-60);
      save();
      renderShiftCard();
    };
    head.appendChild(x);
    box.appendChild(head);
    const home = homeBy(cur, S.travel);
    const big = el('div', 'sc-end');
    big.appendChild(el('span', undefined, 'Finish '));
    big.appendChild(el('b', undefined, cur.end.slice(11, 16)));
    big.appendChild(
      el('span', 'muted', ` · ${timeLeft(cur)} left${home ? ` · home by ${home}` : ''}`),
    );
    box.appendChild(big);
    return;
  }
  const n = nextShift(S.shifts);
  if (!n || S.shiftCardsDone.includes(shiftKey(n.shift))) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const s = n.shift;
  const alarm = alarmFor(s, S.shiftRules, S.shiftLead);
  const day =
    n.when === 'today'
      ? 'Today'
      : n.when === 'tomorrow'
        ? 'Tomorrow'
        : describeShift(s).slice(0, 10);
  const head = el('div', 'sc-head');
  head.appendChild(el('b', undefined, `${day} · ${s.title}`));
  const go = leaveBy(s, S.travel);
  head.appendChild(
    el(
      'span',
      'muted',
      ` ${s.start.slice(11, 16)}–${s.end.slice(11, 16)}${go ? ` · leave by ${go}` : ''}`,
    ),
  );
  box.appendChild(head);
  const home = homeBy(s, S.travel);
  const fin = el('div', 'sc-end');
  fin.appendChild(el('span', undefined, 'Finish '));
  fin.appendChild(el('b', undefined, s.end.slice(11, 16)));
  if (s.end.slice(0, 10) !== s.start.slice(0, 10))
    fin.appendChild(el('span', 'muted', ' next day'));
  if (home) fin.appendChild(el('span', 'muted', ` · home by ${home}`));
  const x = el('button', 'x', '✕');
  x.setAttribute('aria-label', 'Hide until the next shift');
  x.onclick = () => {
    S.shiftCardsDone = [...S.shiftCardsDone, shiftKey(s)].slice(-60);
    save();
    renderShiftCard();
  };
  head.appendChild(x);
  box.appendChild(fin);
  const row = el('div', 'sc-row');
  if (android) {
    const phone = el('a', 'btn acc') as HTMLAnchorElement;
    phone.textContent = `⏰ Phone alarm ${alarm.time}`;
    phone.href = androidAlarmLink(alarm.hour, alarm.minute, `Shift: ${s.title}`.slice(0, 40));
    row.appendChild(phone);
  }
  const lex = el('button', 'btn', `🔊 Tell Alexa ${alarm.time}`);
  const when = n.when === 'later' ? '' : ` ${n.when}`;
  lex.onclick = () => tellAlexa(`set an alarm for ${spokenTime(alarm.time)}${when}`);
  row.appendChild(lex);
  box.appendChild(row);
  box.appendChild(
    el(
      'p',
      'muted sc-tip',
      'The phone button opens Clock with the time filled in: tap Save (Samsung may add it next to your existing alarm). Alarm times: People › Shifts.',
    ),
  );
}

/* ── Shifts: pick screenshots of the rota, then Alton reads them ── */
const SHIFTS_TEXT = 'Add these shifts to my calendar';
function askForShifts(pick = true): void {
  const ta = $<HTMLTextAreaElement>('msg');
  ta.value = SHIFTS_TEXT;
  toast('Pick screenshots of your rota (or share them from your shift app).');
  if (pick) $('photo').click();
}

/* ── Spending bar under the header: this month's Claude spend on this phone ── */
function renderSpend(): void {
  const u = summarise(S.usage, S.budget);
  const lvl = spendLevel(u.month, S.budget);
  const t = $('spendText');
  t.textContent = `· ${S.saver ? '🍃 ' : ''}${fmtUsd(u.month)}${S.budget > 0 ? ` / ${fmtUsd(S.budget)}` : ''} this month`;
  t.className = lvl.tone === 'ok' ? '' : lvl.tone;
  const bar = $('spendBar');
  bar.hidden = !(S.budget > 0);
  bar.className = `spendbar${lvl.tone === 'ok' ? '' : ` ${lvl.tone}`}`;
  $('spendFill').style.width = `${Math.max(2, lvl.pct)}%`;
}

/* ── Is the PC on? (Tailscale HTTPS address): switch to the full version automatically ── */
let pcOnline = false;
let stayPhone = false;
try {
  stayPhone = sessionStorage.getItem('alton-stay-phone') === '1';
} catch {
  /* private mode */
}
/** Why the last PC check failed ('' when it worked). */
let pcWhy = '';
async function checkPc(): Promise<void> {
  const base = S.pcHttps.replace(/\/+$/, '');
  // Tailscale HTTPS names only (the app's security policy allows nothing else).
  if (!base) {
    pcWhy = 'No PC address yet: paste it in the box above.';
    return setPcOnline(false);
  }
  if (!/^https:\/\/[\w.-]+\.ts\.net(:\d+)?$/.test(base)) {
    pcWhy = 'The address should look like https://palpatine.tail1234.ts.net';
    return setPcOnline(false);
  }
  const timeout = (ms: number): AbortSignal | undefined => {
    try {
      return AbortSignal.timeout(ms);
    } catch {
      return undefined; // older browsers: no timeout
    }
  };
  try {
    const r = await fetch(`${base}/api/ping`, { cache: 'no-store', signal: timeout(5000) });
    pcWhy = r.ok
      ? ''
      : r.status === 404
        ? 'The PC answered but its Alton is older: install the latest version on the PC.'
        : `The PC answered with an error (${r.status}).`;
    setPcOnline(r.ok);
  } catch (e) {
    // Some browsers block reading the answer from a private address; a plain "is anything
    // there?" request still works (it can't read anything back, which is all we need).
    try {
      await fetch(`${base}/api/ping`, {
        mode: 'no-cors',
        cache: 'no-store',
        signal: timeout(5000),
      });
      pcWhy = '';
      setPcOnline(true);
    } catch (e2) {
      const err = e2 as Error;
      pcWhy =
        err.name === 'TimeoutError' || err.name === 'AbortError'
          ? 'No answer: is Tailscale on (on both), and is the PC on with Alton running?'
          : `Couldn’t reach the PC from the app (${(e as Error).name}: ${(e as Error).message}). Check Tailscale is on; if the browser asks to allow access to devices on your network, allow it.`;
      setPcOnline(false);
    }
  }
}
function setPcOnline(on: boolean): void {
  const was = pcOnline;
  pcOnline = on;
  const m = $('mode').firstElementChild;
  if (m) m.textContent = on ? 'PC is on · tap “Full” for PC control' : 'Phone mode · PC not needed';
  $('fullBtn').hidden = !on;
  if (on && !was && S.autoSwitch && !stayPhone && !busy) {
    toast('Your PC is on: opening the full version…');
    setTimeout(() => (location.href = S.pcHttps), 900);
  }
}

/* ── App lock (PIN) ── */
async function pinHashOf(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
let hiddenAt = 0;
function lockNow(): void {
  if (!S.pinHash) return;
  $('lock').hidden = false;
  $<HTMLInputElement>('pinInput').value = '';
  setTimeout(() => $('pinInput').focus(), 50);
}
async function tryUnlock(): Promise<void> {
  const v = $<HTMLInputElement>('pinInput').value.trim();
  if ((await pinHashOf(v, S.pinSalt)) === S.pinHash) {
    $('lock').hidden = true;
    $('pinMsg').textContent = '';
  } else {
    $('pinMsg').textContent = 'Wrong PIN.';
    $<HTMLInputElement>('pinInput').value = '';
  }
}
async function setPin(): Promise<void> {
  if (S.pinHash) {
    if (!confirm('Remove the PIN lock?')) return;
    S.pinHash = '';
    S.pinSalt = '';
    save();
    renderSettings();
    return toast('PIN lock removed.');
  }
  const a = prompt('Choose a PIN (4–8 digits)')?.trim() ?? '';
  if (!/^\d{4,8}$/.test(a)) return toast('Use 4 to 8 digits.');
  if (prompt('Type it again')?.trim() !== a) return toast('Those didn’t match.');
  S.pinSalt = crypto.getRandomValues(new Uint32Array(2)).join('-');
  S.pinHash = await pinHashOf(a, S.pinSalt);
  save();
  renderSettings();
  toast('PIN lock on: asked when you open Alton or come back after 5 minutes.');
}

/* ── Offline queue ── */
const queuedImages = new Map<string, string[]>();
let flushing = false;
async function flushQueue(): Promise<void> {
  if (flushing || !navigator.onLine || !apiKey) return;
  flushing = true;
  try {
    while (S.queue.length) {
      if (busy) await new Promise((r) => setTimeout(r, 500));
      if (busy) continue;
      const id = S.queue.shift() ?? '';
      save();
      const c = S.chats.find((x) => x.id === id);
      if (!c || c.messages[c.messages.length - 1]?.role !== 'user') continue;
      if (chatId === id) renderMsgs('Thinking…');
      await ask(c, queuedImages.get(id) ?? []);
      queuedImages.delete(id);
    }
  } finally {
    flushing = false;
  }
}

/* ── Saved prompts: typing "/" shows them above the box ── */
function hideSlash(): void {
  const box = $('slash');
  box.textContent = '';
  box.hidden = true;
}
function renderSlash(): void {
  const v = $<HTMLTextAreaElement>('msg').value;
  const m = v.match(/^\/([a-z0-9-]*)$/i);
  if (!m) return hideSlash();
  const q = (m[1] ?? '').toLowerCase();
  const hits = S.prompts.filter((p) => p.name.startsWith(q)).slice(0, 8);
  const box = $('slash');
  box.textContent = '';
  box.hidden = !hits.length;
  for (const p of hits) {
    const b = el('button');
    b.appendChild(el('b', undefined, `/${p.name}`));
    b.appendChild(
      el('span', 'muted', ` ${(p.text.split('\n')[0] ?? '').replace('{text}', '…').slice(0, 60)}`),
    );
    b.onclick = () => {
      const ta = $<HTMLTextAreaElement>('msg');
      ta.value = `/${p.name} `;
      hideSlash();
      ta.focus();
    };
    box.appendChild(b);
  }
}

/* ── Share a chat (to WhatsApp, notes, email...) ── */
function shareChat(): void {
  const c = chat();
  if (!c?.messages.length) return toast('Nothing to share yet.');
  const text = [
    `# ${cleanTitle(c.title)}`,
    ...c.messages.map((m) => `${m.role === 'user' ? 'Me' : S.name}: ${plain(m.text)}`),
  ].join('\n\n');
  if (navigator.share)
    void navigator.share({ title: cleanTitle(c.title), text }).catch(() => undefined);
  else
    void navigator.clipboard
      ?.writeText(text)
      .then(() => toast('Chat copied.'))
      .catch(() => toast('Couldn’t copy that.'));
}

/** Hand a calendar file to the phone: the share sheet (pick Calendar), else a download
 *  that opens in the calendar app. */
async function openIcs(name: string, text: string): Promise<void> {
  const file = new File([text], name, { type: 'text/calendar' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Shifts' });
      return;
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  toast('Saved shifts.ics: open it to add the shifts to your calendar.');
}

function actionNode(a: PhoneAction): HTMLElement {
  const b = el(a.href ? 'a' : 'button', 'actbtn') as HTMLAnchorElement;
  const txt = el('span');
  txt.appendChild(document.createTextNode(a.label));
  if (a.sub) txt.appendChild(el('small', undefined, a.sub));
  b.appendChild(el('span', 'dot'));
  b.appendChild(txt);
  if (a.href) {
    b.href = a.href;
    if (/^https?:/.test(a.href)) {
      b.target = '_blank';
      b.rel = 'noopener noreferrer';
    }
  } else if (a.share != null) {
    b.onclick = () => {
      const text = a.share ?? '';
      if (navigator.share) void navigator.share({ text }).catch(() => undefined);
      else void navigator.clipboard?.writeText(text).then(() => toast('Copied'));
    };
  } else if (a.pickFor) {
    b.onclick = () => void pickContact(a.pickFor);
  } else if (a.alexa) {
    const cmd = a.alexa;
    b.onclick = () => tellAlexa(cmd);
  } else if (a.ics) {
    const { name, text } = a.ics;
    b.onclick = () => void openIcs(name, text);
  }
  if (a.marks?.length) {
    b.addEventListener('click', () => {
      S.addedShifts = [...new Set([...S.addedShifts, ...(a.marks ?? [])])].slice(-500);
      save();
    });
  }
  return b;
}

function assistantNode(m: PhoneMessage, liveActivity?: string): HTMLElement {
  const d = el('div', 'it');
  const who = el('div', 'who');
  who.appendChild(el('span', 'dot'));
  who.appendChild(document.createTextNode(S.name));
  d.appendChild(who);
  const body = el('div', 'md');
  body.innerHTML = md(m.text);
  d.appendChild(body);
  if (m.actions?.length) {
    const box = el('div', 'actions');
    m.actions.forEach((a) => box.appendChild(actionNode(a)));
    d.appendChild(box);
  }
  if (m.sources?.length) {
    const src = el('div', 'sources');
    m.sources.slice(0, 8).forEach((s) => {
      const a = el('a', undefined, s.title);
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      src.appendChild(a);
    });
    d.appendChild(src);
  }
  if (liveActivity) {
    const act = el('div', 'activity');
    act.appendChild(el('span', 'pulse'));
    act.appendChild(document.createTextNode(liveActivity));
    d.appendChild(act);
  } else if (m.text) {
    const tools = el('div', 'tools');
    const copy = el('button', undefined, 'Copy');
    copy.onclick = () =>
      void navigator.clipboard?.writeText(plain(m.text)).then(() => toast('Copied'));
    const read = el('button', undefined, 'Read aloud');
    read.onclick = () => say(m.text, true);
    tools.append(copy, read);
    const c = chat();
    if (c && c.messages[c.messages.length - 1] === m) {
      const again = el('button', undefined, 'Try again');
      again.onclick = () => regenerate();
      tools.appendChild(again);
    }
    d.appendChild(tools);
  }
  return d;
}

function renderMsgs(activity?: string): void {
  renderShiftCard();
  renderBackupNudge();
  const box = $('msgs');
  box.textContent = '';
  const c = chat();
  $('title').textContent = c ? cleanTitle(c.title) : S.name;
  $('researchBtn').classList.toggle('on', research);
  if (!c || !c.messages.length) {
    const w = el('div', 'welcome');
    w.appendChild(
      el(
        'h2',
        undefined,
        research
          ? 'What would you like to research?'
          : `Hi${S.userName ? ` ${S.userName}` : ''}, how can I help?`,
      ),
    );
    w.appendChild(el('p', 'muted', 'Works anywhere, even with your PC off.'));
    const g = el('div', 'sugg');
    [
      'Brief me',
      'Text Mum that I’ll be late',
      'Add my shifts to my calendar',
      'Directions to the nearest Tesco',
      'Set a 20 minute timer',
      'What’s the weather this weekend?',
      'Add milk to my shopping list',
      'Explain this photo',
    ]
      .slice(0, 6)
      .forEach((t) => {
        const b = el('button', undefined, t);
        b.onclick = () => {
          if (t === 'Add my shifts to my calendar') return askForShifts();
          return t === 'Explain this photo' ? $('photo').click() : send(t);
        };
        g.appendChild(b);
      });
    w.appendChild(g);
    if (S.prompts.length) {
      const pr = el('div', 'sugg');
      S.prompts.slice(0, 4).forEach((p) => {
        const b = el('button', undefined, `/${p.name}`);
        b.title = p.text;
        b.onclick = () => {
          const ta = $<HTMLTextAreaElement>('msg');
          ta.value = `/${p.name} `;
          ta.focus();
        };
        pr.appendChild(b);
      });
      w.appendChild(el('p', 'muted', 'Your saved prompts (type / to see them all):'));
      w.appendChild(pr);
    }
    box.appendChild(w);
    return;
  }
  c.messages.forEach((m, i) => {
    if (m.role === 'user') {
      const u = el('div', 'me');
      (m.images ?? []).forEach((src) => {
        if (/^data:image\//.test(src)) {
          const im = el('img');
          im.src = src;
          u.appendChild(im);
        }
      });
      u.appendChild(document.createTextNode(m.text));
      box.appendChild(u);
      if (i === c.messages.length - 1 && S.queue.includes(c.id)) {
        const w = el('p', 'muted', 'Waiting for signal… sends automatically.');
        w.style.alignSelf = 'flex-end';
        w.style.margin = '-6px 4px 0';
        w.style.fontSize = '12px';
        box.appendChild(w);
      }
      const isLastUser = !c.messages.slice(i + 1).some((x) => x.role === 'user');
      if (isLastUser && !busy) {
        const edit = el('button', 'chip', 'Edit');
        edit.style.alignSelf = 'flex-end';
        edit.style.marginTop = '-8px';
        edit.onclick = () => editLast();
        box.appendChild(edit);
      }
    } else
      box.appendChild(
        assistantNode(m, i === c.messages.length - 1 && busy ? activity || undefined : undefined),
      );
  });
  $('main').scrollTop = 1e9;
}

function setSending(on: boolean): void {
  const b = $('sendBtn');
  b.classList.toggle('stop', on);
  b.innerHTML = on
    ? '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="1"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
}

function say(text: string, force = false, then?: () => void): void {
  if ((!S.speak && !force) || !('speechSynthesis' in window)) return then?.();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(plain(text).slice(0, 3000));
  u.rate = 1.03;
  if (then) {
    u.onend = () => then();
    u.onerror = () => then();
  }
  speechSynthesis.speak(u);
}

/* Hands-free: Alton answers out loud, then listens again, until you tap the button or say
   "stop" / "that's all". */
let handsFree = false;
function setHandsFree(on: boolean): void {
  handsFree = on;
  $('handsBtn').classList.toggle('live', on);
  if (on) {
    toast('Hands-free on: just talk. Say “that’s all” to stop.');
    if (!recog && !busy) toggleMic();
  } else {
    recog?.stop();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }
}

/* ── Chats drawer ── */
function renderChatList(q = ''): void {
  const box = $('chatlist');
  box.textContent = '';
  const l = q.toLowerCase();
  [...S.chats]
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned))
    .filter(
      (c) =>
        !l ||
        c.title.toLowerCase().includes(l) ||
        c.messages.some((m) => m.text.toLowerCase().includes(l)),
    )
    .forEach((c) => {
      const row = el('div', `ci${c.id === chatId ? ' on' : ''}`);
      const t = el(
        'span',
        undefined,
        `${c.research ? '🔬 ' : ''}${c.id.startsWith('p-') ? '' : '🖥 '}${cleanTitle(c.title)}`,
      );
      t.onclick = () => {
        chatId = c.id;
        research = c.research;
        closeDrawer();
        renderMsgs();
      };
      const pin = el('button', 'x', c.pinned ? '★' : '☆');
      pin.setAttribute('aria-label', c.pinned ? 'Unpin' : 'Pin');
      pin.onclick = () => {
        c.pinned = !c.pinned;
        save();
        renderChatList(q);
      };
      const ren = el('button', 'x', '✎');
      ren.setAttribute('aria-label', 'Rename');
      ren.onclick = () => {
        const v = prompt('Rename chat', cleanTitle(c.title))?.trim();
        if (!v) return;
        c.title = v.slice(0, 80);
        c.updatedAt = Date.now();
        save();
        renderChatList(q);
        renderMsgs();
      };
      const x = el('button', 'x', '✕');
      x.onclick = () => {
        if (!confirm(`Delete “${cleanTitle(c.title)}” from this phone?`)) return;
        S.chats = S.chats.filter((y) => y !== c);
        if (chatId === c.id) chatId = S.chats[0]?.id ?? null;
        save();
        renderChatList(q);
        renderMsgs();
      };
      row.append(t, pin, ren, x);
      box.appendChild(row);
    });
  if (!box.childNodes.length) box.appendChild(el('p', 'muted', 'No chats yet.'));
}
const openDrawer = (): void => {
  $('drawer').classList.add('open');
  $('scrim').classList.add('open');
  renderChatList();
};
const closeDrawer = (): void => {
  $('drawer').classList.remove('open');
  $('scrim').classList.remove('open');
};

/* ── Photos ── */
function shrink(file: File, max: number, q: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That isn’t a picture.'));
    };
    img.src = url;
  });
}
function renderThumbs(): void {
  const box = $('thumbs');
  box.textContent = '';
  pending.forEach((p, n) => {
    const d = el('div');
    const im = el('img');
    im.src = p.thumb;
    const x = el('button', undefined, '×');
    x.onclick = () => {
      pending.splice(n, 1);
      renderThumbs();
    };
    d.append(im, x);
    box.appendChild(d);
  });
}

/* ── Voice input ── */
type Recog = {
  lang: string;
  interimResults: boolean;
  onresult: (e: {
    results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
  }) => void;
  onend: () => void;
  onerror: (e: { error: string }) => void;
  start(): void;
  stop(): void;
};
let recog: Recog | null = null;
function toggleMic(): void {
  const W = window as unknown as {
    SpeechRecognition?: new () => Recog;
    webkitSpeechRecognition?: new () => Recog;
  };
  const R = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  if (!R) return toast('Voice typing isn’t supported in this browser; use the keyboard’s mic.');
  if (recog) {
    recog.stop();
    return;
  }
  const r = new R();
  recog = r;
  r.lang = navigator.language || 'en-GB';
  r.interimResults = true;
  const ta = $<HTMLTextAreaElement>('msg');
  const before = ta.value;
  let final = '';
  r.onresult = (e) => {
    let text = '';
    let done = false;
    for (let i = 0; i < e.results.length; i++) {
      const res = e.results[i];
      if (!res) continue;
      text += res[0]?.transcript ?? '';
      if (res.isFinal) done = true;
    }
    ta.value = `${before}${before ? ' ' : ''}${text}`;
    if (done) final = ta.value;
  };
  r.onend = () => {
    recog = null;
    $('micBtn').classList.remove('live');
    if (
      final &&
      handsFree &&
      /^(stop|that'?s all|that is all|goodbye|bye|thanks,? that'?s all)\.?$/i.test(final.trim())
    ) {
      $<HTMLTextAreaElement>('msg').value = '';
      setHandsFree(false);
      return;
    }
    if (final && (S.autoSend || handsFree)) send(final);
    else if (handsFree && !final)
      setTimeout(() => handsFree && !busy && !recog && toggleMic(), 400);
  };
  r.onerror = (e) => {
    if (e.error === 'not-allowed')
      toast('Allow the microphone for this site in your browser settings.');
  };
  $('micBtn').classList.add('live');
  r.start();
}

/* ── People, lists, memories ── */
async function pickContact(forName?: string): Promise<void> {
  const nav = navigator as unknown as {
    contacts?: {
      select(
        props: string[],
        o: { multiple: boolean },
      ): Promise<Array<{ name?: string[]; tel?: string[]; email?: string[] }>>;
    };
  };
  if (!nav.contacts)
    return toast(
      'This browser can’t open contacts (Android Chrome can). Type the name and number in People instead.',
    );
  try {
    const picked = await nav.contacts.select(['name', 'tel', 'email'], { multiple: !forName });
    for (const c of picked) {
      const name = forName ?? c.name?.[0] ?? 'Contact';
      const p: Person = {
        name,
        ...(c.tel?.[0] ? { phone: c.tel[0] } : {}),
        ...(c.email?.[0] ? { email: c.email[0] } : {}),
      };
      S.people = [...S.people.filter((x) => x.name.toLowerCase() !== name.toLowerCase()), p];
    }
    save();
    renderPeople();
    if (picked.length)
      toast(
        forName
          ? `Saved ${forName}. Ask again and it’ll work.`
          : `Saved ${picked.length} contact(s).`,
      );
  } catch {
    /* cancelled */
  }
}
function renderShifts(): void {
  const box = $('shiftList');
  box.textContent = '';
  const up = upcomingShifts(S.shifts);
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  const pay = (d: Date): string =>
    S.payRate > 0 ? ` (≈ ${money(weekPay(S.shifts, S.payRate, S.unpaidBreak, d))})` : '';
  $('shiftHours').textContent = up.length
    ? `This week ${weekHours(S.shifts, now)}h${pay(now)} · next week ${weekHours(S.shifts, next)}h${pay(next)}`
    : 'No shifts yet: share a screenshot of your rota to Alton.';
  up.slice(0, 20).forEach((s) => {
    const row = el('div', 'li');
    const a = alarmFor(s, S.shiftRules, S.shiftLead);
    const t = el('span', undefined, `${describeShift(s)} · ${s.title}`);
    t.style.flex = '1';
    t.title = `Alarm ${a.time}`;
    const x = el('button', 'x', '✕');
    x.setAttribute('aria-label', 'Remove this shift');
    x.onclick = () => {
      S.shifts = S.shifts.filter((y) => y !== s);
      save();
      renderShifts();
    };
    row.append(t, x);
    box.appendChild(row);
  });
  $<HTMLInputElement>('shiftLead').value = String(S.shiftLead);
  $<HTMLInputElement>('shiftRules').value = formatAlarmRules(S.shiftRules);
  $<HTMLInputElement>('payRate').value = S.payRate ? String(S.payRate) : '';
  $<HTMLInputElement>('unpaidBreak').value = S.unpaidBreak ? String(S.unpaidBreak) : '';
  $<HTMLInputElement>('travel').value = S.travel ? String(S.travel) : '';
}

function renderPeople(): void {
  renderShifts();
  const box = $('peopleList');
  box.textContent = '';
  S.people.forEach((p) => {
    const row = el('div', 'li');
    const t = el('span', undefined, `${p.name} · ${p.phone ?? p.email ?? ''}`);
    t.style.flex = '1';
    const x = el('button', 'x', '✕');
    x.onclick = () => {
      S.people = S.people.filter((y) => y !== p);
      save();
      renderPeople();
    };
    row.append(t, x);
    box.appendChild(row);
  });
  if (!S.people.length) box.appendChild(el('p', 'muted', 'Nobody saved yet.'));
  const lists = $('lists');
  lists.textContent = '';
  // Add: "Shopping: milk, eggs" (no list name → To-do).
  const add = el('div', 'row');
  const inp = el('input', 'input');
  inp.placeholder = 'Add, e.g. “Shopping: milk, eggs”';
  const go = el('button', 'btn acc', 'Add');
  go.onclick = () => {
    const v = inp.value.trim();
    if (!v) return;
    const m = /^([^:]{1,40}):\s*(.+)$/.exec(v);
    const name = m?.[1]?.trim() ?? 'To-do';
    const items = (m?.[2] ?? v)
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    let l = S.lists.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!l) {
      l = { name, items: [] };
      S.lists.push(l);
    }
    for (const text of items) {
      l.items.push({ text, done: false });
      S.newListItems.push({ list: name, text });
    }
    save();
    renderPeople();
  };
  add.append(inp, go);
  add.style.marginBottom = '8px';
  lists.appendChild(add);
  S.lists.forEach((l) => {
    const open = l.items.filter((i) => !i.done);
    if (!open.length || l.name === 'Alton roadmap') return;
    lists.appendChild(el('b', undefined, l.name));
    open.forEach((i) => {
      const row = el('div', 'li');
      const chk = el('button', 'check');
      chk.setAttribute('aria-label', `Tick off ${i.text}`);
      chk.onclick = () => {
        i.done = true;
        S.listOps.push({ list: l.name, text: i.text, op: 'done' });
        save();
        renderPeople();
        toast(`Ticked off ${i.text}`);
      };
      const t = el('span', undefined, i.text);
      t.style.flex = '1';
      const x = el('button', 'x', '✕');
      x.onclick = () => {
        l.items = l.items.filter((y) => y !== i);
        S.listOps.push({ list: l.name, text: i.text, op: 'remove' });
        save();
        renderPeople();
      };
      row.append(chk, t, x);
      lists.appendChild(row);
    });
  });
  if (lists.childNodes.length === 1)
    lists.appendChild(
      el('p', 'muted', 'Lists from the PC show here after a sync, or add one above.'),
    );
  const goals = $('goals');
  goals.textContent = '';
  S.goals.forEach((g) => {
    const row = el('div', 'li');
    const t = el('span', undefined, g.title);
    t.style.flex = '1';
    const bar = el('div', 'bar');
    bar.style.width = '90px';
    const fill = el('i');
    fill.style.width = `${g.progress}%`;
    bar.appendChild(fill);
    row.append(t, bar, el('span', 'muted', `${g.progress}%`));
    goals.appendChild(row);
  });
  if (!S.goals.length)
    goals.appendChild(
      el('p', 'muted', 'Goals from the PC show here after a sync. Ask “my goal is to…” on the PC.'),
    );
  const notes = $('notesList');
  notes.textContent = '';
  S.notes.slice(0, 30).forEach((n) => {
    const card = el('div', 'li');
    const body = el('div', 'md');
    body.style.flex = '1';
    body.innerHTML = md(n.length > 400 ? `${n.slice(0, 400)}…` : n);
    card.appendChild(body);
    notes.appendChild(card);
  });
  if (!S.notes.length) notes.appendChild(el('p', 'muted', 'No notes yet.'));
  const mems = $('mems');
  mems.textContent = '';
  S.memories.slice(-60).forEach((m) => {
    const row = el('div', 'li');
    const t = el('span', undefined, m);
    t.style.flex = '1';
    t.onclick = () => {
      const v = prompt('Edit memory', m)?.trim();
      if (!v || v === m) return;
      S.memories = S.memories.map((x) => (x === m ? v : x));
      S.newMemories = [...S.newMemories.filter((x) => x !== m), v];
      save();
      renderPeople();
    };
    const x = el('button', 'x', '✕');
    x.onclick = () => {
      S.memories = S.memories.filter((y) => y !== m);
      S.newMemories = S.newMemories.filter((y) => y !== m);
      save();
      renderPeople();
    };
    row.append(t, x);
    mems.appendChild(row);
  });
  if (!S.memories.length)
    mems.appendChild(
      el('p', 'muted', 'Sync from the PC to bring your memories over, or say “remember that…”.'),
    );
}

/* ── PC tab ── */
function renderPc(): void {
  const open = $<HTMLAnchorElement>('openPc');
  if (S.pcUrl) {
    open.href = S.pcUrl;
    $('pcUrlText').textContent = S.pcUrl;
  } else {
    open.removeAttribute('href');
    $('pcUrlText').textContent =
      'Sync once from the PC version and its address will be saved here.';
  }
  $('syncInfo').textContent = S.lastPcSync
    ? `Last synced from the PC: ${new Date(S.lastPcSync).toLocaleString()}`
    : 'Not synced yet.';
  const macs = $('macs');
  macs.textContent = '';
  S.macs.forEach((m) => macs.appendChild(el('code', 'mac', m)));
  if (!S.macs.length) macs.textContent = 'Sync from the PC to see it here.';
}
function sendToPc(): void {
  if (!S.pcUrl) return toast('Sync from the PC version first, so I know its address.');
  const chats = S.chats.filter((c) => c.updatedAt > S.lastExport);
  const payload: SyncToPc = {
    v: 1,
    chats,
    memories: S.newMemories,
    listItems: S.newListItems,
    listOps: S.listOps,
    notes: S.newNotes,
    shifts: upcomingShifts(S.shifts),
  };
  S.newMemories = [];
  S.newListItems = [];
  S.listOps = [];
  S.newNotes = [];
  S.lastExport = Date.now();
  save();
  location.href = `${S.pcUrl.replace(/\/?$/, '/')}#import=${encodeSync(payload)}`;
}

/* ── Settings ── */
function renderSettings(): void {
  $<HTMLSelectElement>('model').value = S.model;
  $<HTMLInputElement>('userName').value = S.userName;
  $<HTMLInputElement>('country').value = S.country;
  const tick = (id: string, on: boolean): void => {
    $(id).classList.toggle('on', on);
    $(id).textContent = on ? '✓' : '';
  };
  tick('speakToggle', S.speak);
  tick('autoToggle', S.autoSend);
  tick('saverToggle', S.saver);
  tick('autoSwitchToggle', S.autoSwitch);
  $('pinBtn').textContent = S.pinHash ? 'Remove PIN lock' : 'Set a PIN lock';
  $<HTMLInputElement>('pcHttps').value = S.pcHttps;
  const u = summarise(S.usage, S.budget);
  $('spendToday').textContent = fmtUsd(u.today);
  $('spendMonth').textContent = fmtUsd(u.month);
  $<HTMLInputElement>('budget').value = String(S.budget || '');
}

async function checkKey(k: string): Promise<string | null> {
  if (!/^sk-ant-[\w-]{20,}$/.test(k))
    return 'That doesn’t look like an Anthropic key (it starts with sk-ant-).';
  try {
    await new Anthropic({ apiKey: k, dangerouslyAllowBrowser: true }).models.list({ limit: 1 });
    return null;
  } catch (err) {
    return err instanceof Anthropic.AuthenticationError
      ? 'Anthropic says that key isn’t valid.'
      : 'Couldn’t reach Anthropic. Check your internet.';
  }
}

/* ── Wiring ── */
function setView(v: string): void {
  view = v;
  for (const x of ['chat', 'people', 'pc', 'set']) $(`${x}View`).classList.toggle('on', x === v);
  document
    .querySelectorAll('nav.tabs button')
    .forEach((b) => b.classList.toggle('on', b.getAttribute('data-v') === v));
  for (const id of ['menuBtn', 'newBtn', 'researchBtn'])
    $(id).style.visibility = v === 'chat' ? 'visible' : 'hidden';
  $('title').textContent =
    v === 'chat'
      ? chat()
        ? cleanTitle(chat()?.title ?? '')
        : S.name
      : v === 'people'
        ? 'People & lists'
        : v === 'pc'
          ? 'PC'
          : 'Settings';
  if (v === 'people') renderPeople();
  if (v === 'pc') renderPc();
  if (v === 'set') renderSettings();
  if (v === 'chat') renderMsgs();
}

function start(): void {
  const ready = !!apiKey;
  $('setup').hidden = ready;
  $('app').hidden = !ready;
  $('app').style.display = ready ? 'contents' : 'none';
  if (ready) {
    setView(view);
    renderSpend();
    lockNow();
    void checkPc();
    void takeLaunchParams();
    void flushQueue();
  }
}

/** Home-screen shortcuts (?new, ?talk, ?q=, ?brief) and things shared from other apps (?shared). */
async function takeLaunchParams(): Promise<void> {
  const p = new URLSearchParams(location.search);
  if (![...p.keys()].length) return;
  history.replaceState(null, '', location.pathname);
  if (p.has('stay')) {
    stayPhone = true;
    try {
      sessionStorage.setItem('alton-stay-phone', '1');
    } catch {
      /* private mode */
    }
  }
  if (p.has('new')) {
    newChat(false);
    renderMsgs();
  }
  if (p.has('brief')) {
    newChat(false);
    send('Brief me');
  }
  if (p.has('talk')) toggleMic();
  if (p.has('shifts')) {
    newChat(false);
    renderMsgs();
    askForShifts(false);
  }
  const q = p.get('q');
  if (q) {
    const ta = $<HTMLTextAreaElement>('msg');
    ta.value = q;
    ta.focus();
  }
  if (p.has('shared') && 'caches' in window) {
    const cache = await caches.open('alton-shared');
    const text = (await (await cache.match('./shared/text'))?.text()) ?? '';
    const count = Number((await (await cache.match('./shared/count'))?.text()) ?? '0');
    for (let i = 0; i < count; i++) {
      const blob = await (await cache.match(`./shared/file-${i}`))?.blob();
      if (blob) {
        const file = new File([blob], `shared-${i}.jpg`, { type: blob.type });
        const [big, small] = await Promise.all([shrink(file, 1568, 0.82), shrink(file, 160, 0.7)]);
        pending.push({ data: big.slice(big.indexOf(',') + 1), thumb: small });
      }
    }
    for (const k of ['text', 'count', 'file-0', 'file-1', 'file-2', 'file-3'])
      await cache.delete(`./shared/${k}`);
    newChat(false);
    renderMsgs();
    renderThumbs();
    const ta = $<HTMLTextAreaElement>('msg');
    ta.value = text ? `${text}\n\n` : '';
    ta.placeholder = count
      ? 'What should I do with this? (e.g. add these shifts to my calendar)'
      : 'What should I do with this? (e.g. summarise it)';
    ta.focus();
  }
}

function wire(): void {
  $('shareBtn').onclick = shareChat;
  $('mode').onclick = () => setView('set');
  // PC on/off checks while the app is open, and the lock after 5 minutes away.
  setInterval(() => {
    if (!document.hidden) void checkPc();
  }, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else {
      if (S.pinHash && hiddenAt && Date.now() - hiddenAt > 5 * 60_000) lockNow();
      void checkPc();
    }
  });
  $('fullBtn').onclick = (e) => {
    e.stopPropagation();
    location.href = S.pcHttps;
  };
  $('pinGo').onclick = () => void tryUnlock();
  $('pinInput').addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') void tryUnlock();
  });
  $('pinForgot').onclick = () => {
    if (
      !confirm(
        'Forgot the PIN? This removes the lock AND your Claude key from this phone (your chats stay). You will need to paste the key again.',
      )
    )
      return;
    S.pinHash = '';
    S.pinSalt = '';
    save();
    apiKey = '';
    ls.del('alton-key');
    $('lock').hidden = true;
    start();
  };
  $('pinBtn').onclick = () => void setPin();
  $('autoSwitchToggle').onclick = () => {
    S.autoSwitch = !S.autoSwitch;
    save();
    renderSettings();
  };
  $('pcCheck').onclick = async () => {
    $('pcCheckMsg').textContent = 'Checking…';
    stayPhone = true; // just report here; don't jump away mid-check
    await checkPc();
    $('pcCheckMsg').textContent = pcOnline ? 'Connected: your PC is on. ✓' : pcWhy;
  };
  $<HTMLInputElement>('pcHttps').onchange = (e) => {
    const v = (e.target as HTMLInputElement).value.trim().replace(/\/+$/, '');
    if (v && !/^https:\/\/[\w.-]+\.ts\.net(:\d+)?$/.test(v))
      return toast('That should look like https://palpatine.tail1234.ts.net');
    S.pcHttps = v;
    save();
    void checkPc();
  };
  $('saverToggle').onclick = () => {
    S.saver = !S.saver;
    save();
    renderSettings();
    renderSpend();
    toast(S.saver ? 'Saver mode on: cheaper replies.' : 'Saver mode off.');
  };
  // Keep the shift card's countdown fresh.
  setInterval(() => {
    if (!document.hidden && view === 'chat') renderShiftCard();
  }, 60_000);
  $('shiftLead').onchange = () => {
    const v = Number($<HTMLInputElement>('shiftLead').value);
    S.shiftLead = v >= 0 && v <= 600 ? Math.round(v) : 90;
    save();
    renderShifts();
  };
  const num = (id: string, max: number): number => {
    const v = Number($<HTMLInputElement>(id).value.replace(',', '.'));
    return v > 0 && v <= max ? Math.round(v * 100) / 100 : 0;
  };
  $('payRate').onchange = () => {
    S.payRate = num('payRate', 1000);
    save();
    renderShifts();
  };
  $('unpaidBreak').onchange = () => {
    S.unpaidBreak = Math.round(num('unpaidBreak', 180));
    save();
    renderShifts();
  };
  $('travel').onchange = () => {
    S.travel = Math.round(num('travel', 300));
    save();
    renderShifts();
  };
  $('backupBtn').onclick = backup;
  $<HTMLInputElement>('restoreFile').onchange = (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (f) void restore(f);
  };
  $('restoreBtn').onclick = () => $('restoreFile').click();
  $('shiftRules').onchange = () => {
    const raw = $<HTMLInputElement>('shiftRules').value;
    S.shiftRules = parseAlarmRules(raw);
    save();
    renderShifts();
    if (raw.trim() && !S.shiftRules.length) toast('Write them like 07:00=05:45, 12:00=10:00');
  };
  $('msg').addEventListener('input', renderSlash);
  window.addEventListener('online', () => {
    if (S.queue.length) toast('Back online: sending what was waiting.');
    void flushQueue();
  });
  document.querySelectorAll('nav.tabs button').forEach((b) => {
    (b as HTMLButtonElement).onclick = () => setView(b.getAttribute('data-v') ?? 'chat');
  });
  $('keySave').onclick = async () => {
    const k = $<HTMLInputElement>('keyInput').value.trim();
    $('keyMsg').textContent = 'Checking…';
    const err = await checkKey(k);
    if (err) {
      $('keyMsg').textContent = err;
      return;
    }
    apiKey = k;
    ls.set('alton-key', k);
    $<HTMLInputElement>('keyInput').value = '';
    start();
  };
  $('keyChange').onclick = () => {
    apiKey = '';
    ls.del('alton-key');
    start();
  };
  $('menuBtn').onclick = openDrawer;
  $('scrim').onclick = closeDrawer;
  $('chatSearch').oninput = (e) => renderChatList((e.target as HTMLInputElement).value);
  $('newBtn').onclick = () => {
    newChat(false);
    renderMsgs();
  };
  $('dNew').onclick = () => {
    newChat(false);
    closeDrawer();
    renderMsgs();
  };
  $('dResearch').onclick = () => {
    newChat(true);
    closeDrawer();
    renderMsgs();
  };
  $('researchBtn').onclick = () => {
    research = !research;
    const c = chat();
    if (c) c.research = research;
    save();
    renderMsgs();
    toast(research ? 'Research mode: deeper web searches, fuller answers' : 'Research mode off');
  };
  const ta = $<HTMLTextAreaElement>('msg');
  ta.oninput = () => {
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(160, ta.scrollHeight)}px`;
  };
  ta.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 700) {
      e.preventDefault();
      send();
    }
  };
  $('sendBtn').onclick = () => (busy ? busy.abort() : send());
  $('micBtn').onclick = toggleMic;
  $('attachBtn').onclick = () => $('photo').click();
  $<HTMLInputElement>('photo').onchange = (e) => {
    const input = e.target as HTMLInputElement;
    const files = [...(input.files ?? [])].slice(0, 4 - pending.length);
    input.value = '';
    for (const f of files)
      void Promise.all([shrink(f, 1568, 0.82), shrink(f, 160, 0.7)]).then(
        ([big, small]) => {
          pending.push({ data: big.slice(big.indexOf(',') + 1), thumb: small });
          renderThumbs();
        },
        (err: Error) => toast(err.message),
      );
  };
  $('pickContact').onclick = () => void pickContact();
  $('pAdd').onclick = () => {
    const name = $<HTMLInputElement>('pName').value.trim();
    const phone = $<HTMLInputElement>('pPhone').value.trim();
    if (!name || !phone) return toast('Type a name and a number.');
    S.people = [
      ...S.people.filter((x) => x.name.toLowerCase() !== name.toLowerCase()),
      { name, phone },
    ];
    $<HTMLInputElement>('pName').value = '';
    $<HTMLInputElement>('pPhone').value = '';
    save();
    renderPeople();
  };
  $('sendToPc').onclick = sendToPc;
  $('handsBtn').onclick = () => setHandsFree(!handsFree);
  $('noteAdd').onclick = () => {
    const v = $<HTMLInputElement>('noteInput').value.trim();
    if (!v) return;
    S.notes.unshift(v);
    S.newNotes.push(v);
    $<HTMLInputElement>('noteInput').value = '';
    save();
    renderPeople();
  };
  $<HTMLInputElement>('budget').onchange = (e) => {
    S.budget = Math.max(0, Math.round(Number((e.target as HTMLInputElement).value) || 0));
    save();
    renderSettings();
    renderSpend();
  };
  $<HTMLSelectElement>('model').onchange = (e) => {
    S.model = (e.target as HTMLSelectElement).value;
    save();
  };
  $<HTMLInputElement>('userName').onchange = (e) => {
    S.userName = (e.target as HTMLInputElement).value.trim();
    save();
  };
  $<HTMLInputElement>('country').onchange = (e) => {
    S.country = (e.target as HTMLInputElement).value.replace(/\D/g, '') || '44';
    save();
  };
  $('speakToggle').onclick = () => {
    S.speak = !S.speak;
    save();
    renderSettings();
  };
  $('autoToggle').onclick = () => {
    S.autoSend = !S.autoSend;
    save();
    renderSettings();
  };
  $('wipe').onclick = () => {
    if (!confirm('Remove your key, chats, people and memories from this phone?')) return;
    ls.del('alton-key');
    ls.del(KEY);
    location.reload();
  };
}

takeHash();
wire();
start();
if ('serviceWorker' in navigator)
  void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
