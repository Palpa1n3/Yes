/** Phone tools for Claude. Each action becomes a button the user taps (and then confirms in
 *  the app that opens): Alton never sends a message or makes a call by itself. */
import type Anthropic from '@anthropic-ai/sdk';
import {
  buildIcs,
  cleanShifts,
  describeShift,
  shiftHours,
  shiftKey,
  upcomingShifts,
  weekHours,
  weekPay,
  rotaChanges,
  type Shift,
} from '@shared/shifts';
import {
  androidAlarmLink,
  androidTimerLink,
  calendarLink,
  androidEventLink,
  reminderIcs,
  callLink,
  directionsLink,
  emailLink,
  resolvePerson,
  smsLink,
  whatsappLink,
  type Person,
  type PhoneAction,
} from '@shared/phone';

export interface ToolState {
  people: Person[];
  memories: string[];
  lists: Array<{ name: string; items: Array<{ text: string; done: boolean }> }>;
  country: string;
  android: boolean;
  /** Shifts already put in the calendar from this phone (start/end keys). */
  addedShifts?: string[];
  /** Shifts saved on this phone. */
  shifts?: Shift[];
  /** Hourly pay and unpaid break minutes, for pay estimates (0 = unknown). */
  payRate?: number;
  unpaidBreak?: number;
}

export interface ToolOutcome {
  result: string;
  action?: PhoneAction;
  /** Several buttons (e.g. one per shift). */
  actions?: PhoneAction[];
  /** Shifts read from a rota, to keep on the phone. */
  shifts?: Shift[];
  /** A reminder to list in the app. */
  reminder?: { what: string; at: number };
  /** Changes to keep (new memory, list items, contact). */
  remember?: string;
  listItems?: Array<{ list: string; text: string }>;
  person?: Person;
}

const obj = (
  properties: Record<string, unknown>,
  required: string[] = [],
): Anthropic.Tool.InputSchema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

export const PHONE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'send_message',
    description:
      'Get a text or WhatsApp message ready for someone. Shows a button that opens Messages/WhatsApp with the text filled in; the user taps send. "to" is a name from their people/memories (e.g. "Mum") or a number.',
    input_schema: obj(
      {
        to: { type: 'string' },
        message: { type: 'string' },
        via: { type: 'string', enum: ['sms', 'whatsapp'] },
      },
      ['to', 'message'],
    ),
  },
  {
    name: 'call',
    description: 'Get a phone call ready (a button that opens the dialler with the number).',
    input_schema: obj({ to: { type: 'string' } }, ['to']),
  },
  {
    name: 'send_email',
    description: 'Get an email ready in the phone’s mail app (the user taps send).',
    input_schema: obj(
      { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } },
      ['to', 'subject', 'body'],
    ),
  },
  {
    name: 'directions',
    description:
      'Show the route to somewhere (a little map in the chat with the drive/walk time and distance) with buttons to start Google Maps navigation or open the route in Google Maps. Use for "route to…", "directions to…", "navigate to…", "how long to get to…". The destination can be an address, postcode or place name (add the town if it helps). Starts from where the user is unless they give a start.',
    input_schema: obj(
      {
        destination: { type: 'string' },
        origin: { type: 'string', description: 'Start, if not where the user is now.' },
        mode: { type: 'string', enum: ['driving', 'walking', 'transit', 'bicycling'] },
      },
      ['destination'],
    ),
  },
  {
    name: 'add_calendar_event',
    description:
      'Add an event to the user’s Google Calendar (opens it ready to save). Times are local, ISO like 2026-11-20T15:00.',
    input_schema: obj(
      {
        title: { type: 'string' },
        start: { type: 'string' },
        end: { type: 'string' },
        location: { type: 'string' },
        details: { type: 'string' },
      },
      ['title', 'start'],
    ),
  },
  {
    name: 'add_shifts',
    description:
      'Put the user’s work shifts in their calendar, all at once. Use when they share a screenshot of their rota or shift app (or type their shifts) and want them in the calendar. Read every shift carefully: the date with the year (this year, or next year if that month has already passed), and the start and end times in 24-hour time. For an overnight shift give the real finishing time (it is moved to the next day automatically). Title: what the rota calls it (the role, place or shift name, e.g. "Work – Tesco early") or the job you know they have, else "Work". If the rota shows day names, check each date falls on that day (if not, the year or month is wrong: fix it or ask). Leave out days off and holiday unless asked. Never guess a shift you cannot read: ask instead. Afterwards list the shifts back so the user can check them against their app.',
    input_schema: obj(
      {
        shifts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              start: { type: 'string', description: 'Local time, e.g. 2026-11-24T07:00' },
              end: { type: 'string', description: 'Local time, e.g. 2026-11-24T15:30' },
              location: { type: 'string' },
              notes: { type: 'string' },
            },
            required: ['start', 'end'],
            additionalProperties: false,
          },
        },
        reminder_minutes: {
          type: 'number',
          description: 'Reminder before each shift, if the user wants one (e.g. 60).',
        },
        include_added: {
          type: 'boolean',
          description: 'Also include shifts already added before (only if the user asks).',
        },
      },
      ['shifts'],
    ),
  },
  {
    name: 'set_reminder',
    description:
      'A reminder that actually alerts the phone: it goes into the phone\'s own Calendar app (with an alert at the time), via a button the user taps and saves. Use for "remind me to … at 6", "remind me tomorrow at 9 to …". For "in 20 minutes" use set_timer instead. "when" is local time like 2026-11-21T18:00.',
    input_schema: obj(
      {
        what: { type: 'string' },
        when: { type: 'string' },
        minutes_before: {
          type: 'number',
          description: 'Alert this many minutes early (default 0).',
        },
      },
      ['what', 'when'],
    ),
  },
  {
    name: 'get_shifts',
    description:
      'The user’s upcoming work shifts saved on this phone (from rotas they shared), with hours this week and next. Use for “when am I working?”, “how many hours this week?”, “am I off on Saturday?”.',
    input_schema: obj({}),
  },
  {
    name: 'tell_alexa',
    description:
      'Get an Alexa voice command ready: a button makes the phone say it out loud so a nearby Echo hears it (Alexa has no other way in). Write the command without the wake word, e.g. "set an alarm for 5:45 a.m. tomorrow", "turn on my bedroom light", "play Radio 1". Tell the user to tap it near their Echo with the volume up.',
    input_schema: obj({ command: { type: 'string' } }, ['command']),
  },
  {
    name: 'set_timer',
    description: 'Start a countdown timer in the phone’s Clock app.',
    input_schema: obj({ minutes: { type: 'number' }, label: { type: 'string' } }, ['minutes']),
  },
  {
    name: 'set_alarm',
    description: 'Set an alarm in the phone’s Clock app (24-hour HH:MM).',
    input_schema: obj({ time: { type: 'string' }, label: { type: 'string' } }, ['time']),
  },
  {
    name: 'share',
    description: 'Share some text through the phone’s share sheet (any app).',
    input_schema: obj({ text: { type: 'string' } }, ['text']),
  },
  {
    name: 'open_link',
    description: 'Show a button to open a web page.',
    input_schema: obj({ url: { type: 'string' }, label: { type: 'string' } }, ['url']),
  },
  {
    name: 'remember',
    description: 'Remember a lasting fact about the user (also saved to the PC on the next sync).',
    input_schema: obj({ fact: { type: 'string' } }, ['fact']),
  },
  {
    name: 'save_contact',
    description: 'Save who someone is with their number/email, so "text Mum" works next time.',
    input_schema: obj(
      { name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' } },
      ['name'],
    ),
  },
  {
    name: 'add_to_list',
    description: 'Add items to one of the user’s lists (e.g. Shopping, To-do).',
    input_schema: obj(
      { list: { type: 'string' }, items: { type: 'array', items: { type: 'string' } } },
      ['list', 'items'],
    ),
  },
  {
    name: 'get_lists',
    description: 'The user’s lists and what is on them.',
    input_schema: obj({}),
  },
  {
    name: 'get_location',
    description:
      'Where the user is right now (asks the phone for permission the first time). Use for "near me", "here", local questions.',
    input_schema: obj({}),
  },
  {
    name: 'find_nearby',
    description:
      'Show a button that opens Google Maps searching near the user (e.g. "petrol station", "Italian restaurant", "pharmacy open now").',
    input_schema: obj({ query: { type: 'string' } }, ['query']),
  },
  {
    name: 'get_weather',
    description:
      'Weather where the user is now: current conditions and the next 3 days (or for a named place).',
    input_schema: obj({
      place: { type: 'string', description: 'Optional town; default is where the user is' },
    }),
  },
];

const READY =
  'It is ready as a button in the chat: the user taps it, then sends/confirms in that app. Do not say it has been sent.';

const s = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Extra tools inside the Android app (the native side does the work). */
export const APP_TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_messages',
    description:
      'Read the user\'s recent messages (texts, WhatsApp, Messenger and other chat apps) from their phone\'s notifications, newest first. Use for "any messages?", "what did Mum say?", "read my texts". Read them out naturally (who, which app, what they said); summarise long ones. Only messages still showing as notifications are seen.',
    input_schema: obj({
      from: { type: 'string', description: 'Only messages from this person (optional).' },
    }),
  },
  {
    name: 'reply_message',
    description:
      'Prepare a reply to one of the messages from read_messages (use its id). It becomes a Send button the user taps; nothing is sent until they tap it. Say what the reply will be. Only works when canReply is true.',
    input_schema: obj(
      {
        id: { type: 'string' },
        text: { type: 'string' },
        to: { type: 'string', description: 'Who it is for (for the button).' },
      },
      ['id', 'text'],
    ),
  },
  {
    name: 'read_calendar',
    description:
      'Read the events in the phone\'s calendar (work shifts, appointments, birthdays…) for "what\'s on today/tomorrow/this week?". Times come back in local time with start and end.',
    input_schema: obj({
      days_ahead: {
        type: 'number',
        description: 'How many days from today (1 = today only; default 1).',
      },
      start_day_offset: {
        type: 'number',
        description: '0 = today (default), 1 = tomorrow, -1 = yesterday.',
      },
    }),
  },
  {
    name: 'find_contact',
    description:
      "Look up someone in the phone's contacts by name to get their number (before texting or calling someone not in the saved People list).",
    input_schema: obj({ name: { type: 'string' } }, ['name']),
  },
  {
    name: 'snapchat_message',
    description:
      "Send a Snapchat chat message. 'to' is who it's for: a saved person (their Snapchat nickname is looked up) or the name exactly as it shows in their Snapchat chats. It becomes a Send button (or the user says \"send it\" while driving); Alton then opens Snapchat, types it and sends. Text only.",
    input_schema: obj({ to: { type: 'string' }, text: { type: 'string' } }, ['to', 'text']),
  },
  {
    name: 'media_control',
    description:
      'Control whatever is playing on the phone (Spotify, YouTube Music…): next or previous song, pause, play, volume up or down.',
    input_schema: obj(
      {
        action: {
          type: 'string',
          enum: ['next', 'previous', 'pause', 'play', 'play_pause', 'volume_up', 'volume_down'],
        },
      },
      ['action'],
    ),
  },
  {
    name: 'read_shift_app',
    description:
      'Open the user\'s shift/rota app on the phone and read the rota off the screen (no screenshot needed). Then call add_shifts with the shifts you find. Use for "add my shifts", "check my rota", "have my shifts changed?".',
    input_schema: obj({}),
  },
];

export function runPhoneTool(name: string, input: unknown, st: ToolState): ToolOutcome {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const need = (who: string): ToolOutcome => ({
    result: `I don't have a number or email for "${who}". A button lets the user pick them from their contacts; ask them to tap it (or tell you the number), then try again.`,
    action: { label: `Choose ${who} from contacts`, sub: 'Saved for next time', pickFor: who },
  });
  switch (name) {
    case 'send_message': {
      const who = s(o.to, 80);
      const p = resolvePerson(who, st.people, st.memories);
      if (!p?.phone) return need(who);
      const msg = s(o.message, 1500);
      const wa = o.via === 'whatsapp';
      return {
        result: READY,
        action: {
          label: `${wa ? 'WhatsApp' : 'Text'} ${p.name}`,
          sub: msg.length > 80 ? `${msg.slice(0, 80)}…` : msg,
          href: wa ? whatsappLink(p.phone, msg, st.country) : smsLink(p.phone, msg),
        },
      };
    }
    case 'call': {
      const who = s(o.to, 80);
      const p = resolvePerson(who, st.people, st.memories);
      if (!p?.phone) return need(who);
      return {
        result: READY,
        action: { label: `Call ${p.name}`, sub: p.phone, href: callLink(p.phone) },
      };
    }
    case 'send_email': {
      const who = s(o.to, 120);
      const p = resolvePerson(who, st.people, st.memories);
      if (!p?.email) return need(who);
      return {
        result: READY,
        action: {
          label: `Email ${p.name}`,
          sub: s(o.subject, 100),
          href: emailLink(p.email, s(o.subject, 200), s(o.body, 4000)),
        },
      };
    }
    case 'directions': {
      const dest = s(o.destination, 200);
      if (!dest) return { result: 'Missing destination.' };
      return {
        result: READY,
        action: {
          label: `Directions to ${dest}`,
          sub: s(o.mode) || 'driving',
          href: directionsLink(dest, s(o.mode)),
        },
      };
    }
    case 'add_calendar_event': {
      const href = calendarLink({
        title: s(o.title, 200),
        start: s(o.start, 40),
        end: s(o.end, 40) || undefined,
        location: s(o.location, 200) || undefined,
        details: s(o.details, 1000) || undefined,
      });
      if (!href) return { result: 'The start time must look like 2026-11-20T15:00.' };
      return {
        result: READY,
        action: {
          label: `Add “${s(o.title, 60)}” to calendar`,
          sub: s(o.start, 40).replace('T', ' '),
          href,
        },
      };
    }
    case 'add_shifts': {
      const all = cleanShifts(o.shifts);
      if (!all.length)
        return {
          result:
            'No usable shifts: each needs a start and end like 2026-11-24T07:00. If the screenshot was hard to read, ask the user for a clearer one or to type the shifts.',
        };
      // What this rota changes compared with the one saved before.
      const ch = rotaChanges(st.shifts ?? [], all);
      const changeNote = [
        ch.changed.length
          ? `CHANGED since the last rota: ${ch.changed.map((c) => `${describeShift(c.from)} → now ${c.to.start.slice(11, 16)}–${c.to.end.slice(11, 16)}`).join('; ')}. The old times are still in their calendar: tell them to delete those entries.`
          : '',
        ch.removed.length
          ? `REMOVED (no longer on the rota): ${ch.removed.map((r) => `${describeShift(r)} ${r.title}`).join('; ')}. Tell them to delete these from their calendar.`
          : '',
        ch.added.length && (st.shifts ?? []).length
          ? `New on this rota: ${ch.added.map((a) => describeShift(a)).join('; ')}.`
          : '',
      ]
        .filter(Boolean)
        .join(' ');
      const done = new Set(st.addedShifts ?? []);
      const fresh = o.include_added === true ? all : all.filter((x) => !done.has(shiftKey(x)));
      const skipped = all.length - fresh.length;
      if (!fresh.length)
        return {
          result: `All ${all.length} of those shifts were already added to the calendar from this phone. ${changeNote} Ask whether to add them again (then call add_shifts with include_added true).`,
          shifts: all,
        };
      const remind = Number(o.reminder_minutes);
      const mins = remind > 0 && remind <= 24 * 60 ? remind : 0;
      const hours = fresh.reduce((n, x) => n + shiftHours(x), 0);
      const first = describeShift(fresh[0] as (typeof fresh)[number]).replace(/ \d\d:\d\d.*$/, '');
      const last = describeShift(fresh[fresh.length - 1] as (typeof fresh)[number]).replace(
        / \d\d:\d\d.*$/,
        '',
      );
      const n = fresh.length;
      const actions: PhoneAction[] = [
        {
          label: `Add ${n} shift${n > 1 ? 's' : ''} to my calendar`,
          sub: `${first === last ? first : `${first} – ${last}`} · ${Math.round(hours * 10) / 10}h${mins ? ` · reminder ${mins} min before` : ''}`,
          ics: { name: 'shifts.ics', text: buildIcs(fresh, mins) },
          marks: fresh.map(shiftKey),
        },
      ];
      if (n <= 14)
        for (const x of fresh) {
          const href = calendarLink({
            title: x.title,
            start: x.start,
            end: x.end,
            location: x.location,
            details: x.notes,
          });
          if (href)
            actions.push({
              label: describeShift(x),
              sub: `${x.title} · Google Calendar, one at a time`,
              href,
              marks: [shiftKey(x)],
            });
        }
      return {
        result: `Ready. The first button adds all ${n} shift${n > 1 ? 's' : ''} in one go (the phone asks which calendar app to use); below it there is a Google Calendar button for each shift as a backup. Shifts: ${fresh.map((x) => `${describeShift(x)} ${x.title}`).join('; ')}.${skipped ? ` ${skipped} were already added before, so they were left out.` : ''} Total ${Math.round(hours * 10) / 10} hours. Ask the user to check them against their shift app. They are not in the calendar until the user taps and saves.${changeNote ? ` ${changeNote}` : ''} Lead with any changes.`,
        actions,
        shifts: all,
      };
    }
    case 'set_reminder': {
      const what = s(o.what, 200);
      const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s(o.when, 40));
      if (!what || !m) return { result: 'Need "what" and "when" like 2026-11-21T18:00.' };
      const [y, mo, d, h, mi] = m.slice(1, 6).map(Number) as [
        number,
        number,
        number,
        number,
        number,
      ];
      const at = new Date(y, mo - 1, d, h, mi).getTime();
      if (!(at > Date.now() - 60_000))
        return { result: 'That time has already passed; ask for another.' };
      const before = Math.max(0, Math.min(1440, Number(o.minutes_before) || 0));
      const when = new Date(at).toLocaleString([], {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        day: 'numeric',
        month: 'short',
      });
      return {
        result: `Ready as a button: it opens the phone's ${st.android ? 'Calendar' : 'calendar'} with the reminder filled in, set to alert ${before ? `${before} minutes before` : 'at the time'}; the user taps Save. ${READY}`,
        action: st.android
          ? {
              label: `Remind me: ${what}`,
              sub: `${when} · opens your Calendar`,
              href: androidEventLink(
                what,
                at - before * 60_000,
                at - before * 60_000 + 15 * 60_000,
              ),
            }
          : {
              label: `Remind me: ${what}`,
              sub: `${when} · add to your calendar`,
              ics: { name: 'reminder.ics', text: reminderIcs(what, at, before) },
            },
        reminder: { what, at },
      };
    }
    case 'get_shifts': {
      const up = upcomingShifts(st.shifts ?? []);
      if (!up.length)
        return {
          result:
            'No upcoming shifts saved. The user can share a screenshot of their rota (Share › Alton) to add them.',
        };
      const now = new Date();
      const nextWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
      const rate = st.payRate ?? 0;
      const est = (d: Date): string =>
        weekPay(st.shifts ?? [], rate, st.unpaidBreak ?? 0, d).toFixed(2);
      const pay =
        rate > 0
          ? ` Estimated pay before tax (their currency): this week ${est(now)}, next week ${est(nextWeek)}.`
          : '';
      return {
        result: `Upcoming shifts:\n${up
          .slice(0, 30)
          .map((x) => `- ${describeShift(x)} ${x.title}${x.location ? ` @ ${x.location}` : ''}`)
          .join(
            '\n',
          )}\nHours this week (Mon–Sun): ${weekHours(st.shifts ?? [], now)}. Next week: ${weekHours(st.shifts ?? [], nextWeek)}.${pay}`,
      };
    }
    case 'tell_alexa': {
      const cmd = s(o.command, 200).replace(/^(hey\s+)?alexa[,.!\s]*/i, '');
      if (!cmd) return { result: 'Missing the command.' };
      return {
        result:
          'Ready as a button: when the user taps it near their Echo, the phone says it out loud. Alexa may not catch it if the phone is quiet or far away.',
        action: { label: 'Tell Alexa', sub: `“Alexa, ${cmd}”`, alexa: cmd },
      };
    }
    case 'set_timer': {
      const m = Number(o.minutes);
      if (!(m > 0 && m <= 1440)) return { result: 'Minutes must be between 1 and 1440.' };
      if (!st.android)
        return {
          result:
            'iPhones don’t let web apps start timers. Tell the user to say “Hey Siri, set a timer for that long”.',
        };
      return {
        result: READY,
        action: {
          label: `Start a ${m}-minute timer`,
          sub: s(o.label, 60),
          href: androidTimerLink(m, s(o.label, 60)),
        },
      };
    }
    case 'set_alarm': {
      const m = /^(\d{1,2}):(\d{2})$/.exec(s(o.time, 5));
      if (!m) return { result: 'Time must be HH:MM (24-hour).' };
      if (!st.android)
        return {
          result:
            'iPhones don’t let web apps set alarms. Tell the user to say “Hey Siri, set an alarm for that time”.',
        };
      return {
        result: READY,
        action: {
          label: `Set an alarm for ${s(o.time, 5)}`,
          sub: s(o.label, 60),
          href: androidAlarmLink(Number(m[1]), Number(m[2]), s(o.label, 60)),
        },
      };
    }
    case 'share': {
      const text = s(o.text, 4000);
      return { result: READY, action: { label: 'Share…', sub: text.slice(0, 80), share: text } };
    }
    case 'open_link': {
      const url = s(o.url, 2000);
      if (!/^https?:\/\//i.test(url)) return { result: 'Only http(s) links.' };
      return {
        result: READY,
        action: {
          label: s(o.label, 80) || 'Open link',
          sub: url.replace(/^https?:\/\//, '').slice(0, 60),
          href: url,
        },
      };
    }
    case 'remember': {
      const fact = s(o.fact, 300);
      return fact ? { result: `Remembered: ${fact}`, remember: fact } : { result: 'Missing fact.' };
    }
    case 'save_contact': {
      const n = s(o.name, 60);
      if (!n) return { result: 'Missing name.' };
      const person: Person = {
        name: n,
        ...(s(o.phone) ? { phone: s(o.phone, 40) } : {}),
        ...(s(o.email) ? { email: s(o.email, 120) } : {}),
      };
      return { result: `Saved ${n}.`, person };
    }
    case 'add_to_list': {
      const list = s(o.list, 40) || 'To-do';
      const items = (Array.isArray(o.items) ? o.items : []).map((x) => s(x, 200)).filter(Boolean);
      if (!items.length) return { result: 'Missing items.' };
      return {
        result: `Added to ${list}: ${items.join(', ')}.`,
        listItems: items.map((text) => ({ list, text })),
      };
    }
    case 'get_lists':
      return {
        result: JSON.stringify(
          st.lists.map((l) => ({
            list: l.name,
            toDo: l.items.filter((i) => !i.done).map((i) => i.text),
          })),
        ),
      };
    default:
      return { result: `Unknown tool ${name}.` };
  }
}

/** Google Maps search around a point. */
export function nearbyLink(query: string, lat?: number, lon?: number): string {
  const q = encodeURIComponent(query);
  return lat != null && lon != null
    ? `https://www.google.com/maps/search/${q}/@${lat.toFixed(5)},${lon.toFixed(5)},14z`
    : `https://www.google.com/maps/search/${q}+near+me`;
}

const WMO: Record<number, string> = {
  0: 'clear',
  1: 'mostly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'fog',
  48: 'fog',
  51: 'light drizzle',
  53: 'drizzle',
  55: 'heavy drizzle',
  61: 'light rain',
  63: 'rain',
  65: 'heavy rain',
  66: 'freezing rain',
  67: 'freezing rain',
  71: 'light snow',
  73: 'snow',
  75: 'heavy snow',
  77: 'snow grains',
  80: 'showers',
  81: 'heavy showers',
  82: 'violent showers',
  85: 'snow showers',
  86: 'snow showers',
  95: 'thunderstorms',
  96: 'thunderstorms with hail',
  99: 'thunderstorms with hail',
};

/** Open-Meteo forecast JSON → a short summary for Claude. */
export function weatherSummary(j: {
  current?: { temperature_2m?: number; weather_code?: number; wind_speed_10m?: number };
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    weather_code?: number[];
    precipitation_probability_max?: number[];
  };
}): string {
  const c = j.current;
  const d = j.daily;
  const now = c
    ? `Now ${Math.round(c.temperature_2m ?? 0)}°C, ${WMO[c.weather_code ?? -1] ?? 'mixed'}, wind ${Math.round(c.wind_speed_10m ?? 0)} km/h.`
    : '';
  const days = (d?.time ?? []).slice(0, 3).map((t, i) => {
    const day = new Date(`${t}T12:00`).toLocaleDateString([], { weekday: 'long' });
    return `${day}: ${WMO[d?.weather_code?.[i] ?? -1] ?? 'mixed'}, ${Math.round(d?.temperature_2m_min?.[i] ?? 0)}–${Math.round(d?.temperature_2m_max?.[i] ?? 0)}°C, ${d?.precipitation_probability_max?.[i] ?? 0}% chance of rain.`;
  });
  return [now, ...days].filter(Boolean).join(' ');
}
