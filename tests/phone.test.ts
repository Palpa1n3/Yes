import { describe, expect, it } from 'vitest';
import {
  androidTimerLink,
  calendarLink,
  decodeSync,
  directionsLink,
  emailLink,
  encodeSync,
  chatsToSend,
  mergeChatHistory,
  mergeChats,
  resolvePerson,
  smsLink,
  toInternational,
  whatsappLink,
} from '@shared/phone';
import { nearbyLink, runPhoneTool, weatherSummary, type ToolState } from '../phone/src/tools';
import { md } from '../phone/src/md';

const st = (over: Partial<ToolState> = {}): ToolState => ({
  people: [
    { name: 'Mum', phone: '07700 900123' },
    { name: 'Sam Jones', phone: '+447700900456', email: 'sam@example.com' },
  ],
  memories: ["Dad's number is 07700 900789"],
  lists: [{ name: 'Shopping', items: [{ text: 'milk', done: false }] }],
  country: '44',
  android: true,
  ...over,
});

describe('phone links', () => {
  it('builds links for the phone’s apps', () => {
    expect(toInternational('07700 900123')).toBe('+447700900123');
    expect(smsLink('07700 900123', "I'll be late")).toBe("sms:07700900123?&body=I'll%20be%20late");
    expect(whatsappLink('07700 900123', 'hi')).toBe('https://wa.me/447700900123?text=hi');
    expect(emailLink('a@b.com', 'Hi', 'Body')).toBe('mailto:a@b.com?subject=Hi&body=Body');
    expect(directionsLink('Tesco Leeds', 'walking')).toContain(
      'destination=Tesco%20Leeds&travelmode=walking',
    );
    expect(calendarLink({ title: 'Dentist', start: '2026-11-20T15:00' })).toContain(
      'dates=20261120T150000/20261120T160000',
    );
    expect(calendarLink({ title: 'Trip', start: 'friday' })).toBeNull();
    expect(androidTimerLink(5)).toContain('LENGTH=300');
  });

  it('finds people by name, first name or memory', () => {
    expect(resolvePerson('mum', st().people)?.phone).toBe('07700 900123');
    expect(resolvePerson('Sam', st().people)?.email).toBe('sam@example.com');
    expect(resolvePerson('dad', [], st().memories)?.phone).toBe('07700 900789');
    expect(resolvePerson('Bob', st().people)).toBeNull();
    expect(resolvePerson('07123 456789', [])?.phone).toBe('07123 456789');
  });

  it('round-trips sync data (including emoji and accents) and merges chats', () => {
    const data = { v: 1, memories: ['Café ☕ on Fridays'] };
    expect(decodeSync(encodeSync(data))).toEqual(data);
    expect(encodeSync(data)).not.toMatch(/[+/=]/);
    expect(decodeSync('%%%')).toBeNull();
    const a = { id: 'x', title: 'A', research: false, updatedAt: 1, messages: [] };
    const b = { ...a, title: 'B', updatedAt: 2 };
    expect(mergeChats([a], [b])[0]?.title).toBe('B');
    expect(mergeChats([b], [a])[0]?.title).toBe('B');
  });
});

describe('phone tools', () => {
  it('turns requests into buttons, never sends by itself', () => {
    const t = runPhoneTool('send_message', { to: 'Mum', message: 'Running late' }, st());
    expect(t.action?.href).toMatch(/^sms:07700900123/);
    expect(t.result).toMatch(/Do not say it has been sent/);
    expect(
      runPhoneTool('send_message', { to: 'Mum', message: 'x', via: 'whatsapp' }, st()).action?.href,
    ).toMatch(/^https:\/\/wa\.me\/447700900123/);
    expect(runPhoneTool('call', { to: 'Sam' }, st()).action?.href).toBe('tel:+447700900456');
  });
  it('asks to pick a contact it doesn’t know', () => {
    const t = runPhoneTool('send_message', { to: 'Grandma', message: 'hi' }, st());
    expect(t.action?.pickFor).toBe('Grandma');
  });
  it('explains iPhone limits for timers', () => {
    expect(runPhoneTool('set_timer', { minutes: 10 }, st()).action?.href).toMatch(/^intent:/);
    const ios = runPhoneTool('set_timer', { minutes: 10 }, st({ android: false }));
    expect(ios.action).toBeUndefined();
    expect(ios.result).toMatch(/Siri/);
  });
  it('remembers, saves contacts and adds to lists', () => {
    expect(runPhoneTool('remember', { fact: 'Likes tea' }, st()).remember).toBe('Likes tea');
    expect(
      runPhoneTool('save_contact', { name: 'Gran', phone: '0113 111 2222' }, st()).person,
    ).toEqual({ name: 'Gran', phone: '0113 111 2222' });
    expect(
      runPhoneTool('add_to_list', { list: 'Shopping', items: ['eggs', ''] }, st()).listItems,
    ).toEqual([{ list: 'Shopping', text: 'eggs' }]);
    expect(runPhoneTool('open_link', { url: 'javascript:alert(1)' }, st()).action).toBeUndefined();
  });
});

describe('phone markdown', () => {
  it('formats safely', () => {
    expect(md('**bold** and <script>x</script>')).toBe(
      '<p><b>bold</b> and &lt;script&gt;x&lt;/script&gt;</p>',
    );
    expect(md('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>');
    expect(md('[site](javascript:alert(1))')).not.toContain('href="javascript');
    expect(md('see https://example.com/a_b_c')).toContain('href="https://example.com/a_b_c"');
  });
});

describe('location and weather', () => {
  it('builds nearby searches and weather summaries', () => {
    expect(nearbyLink('petrol station', 53.8, -1.55)).toBe(
      'https://www.google.com/maps/search/petrol%20station/@53.80000,-1.55000,14z',
    );
    expect(nearbyLink('pharmacy')).toMatch(/near\+me$/);
    const w = weatherSummary({
      current: { temperature_2m: 7.4, weather_code: 61, wind_speed_10m: 18 },
      daily: {
        time: ['2026-11-19'],
        temperature_2m_max: [9],
        temperature_2m_min: [3],
        weather_code: [3],
        precipitation_probability_max: [40],
      },
    });
    expect(w).toMatch(/Now 7°C, light rain, wind 18 km\/h/);
    expect(w).toMatch(/overcast, 3–9°C, 40% chance of rain/);
  });
});

describe('live sync with the PC', () => {
  const chat = (id: string, msgs: Array<[string, string, number, boolean?]>, updatedAt = 10) => ({
    id,
    title: 'Chat',
    research: false,
    updatedAt,
    messages: msgs.map(([role, text, at, pc]) => ({
      role: role as 'user' | 'assistant',
      text,
      at,
      ...(pc ? { pc } : {}),
    })),
  });
  it('adds the PC’s new messages without dropping the phone’s own copies', () => {
    const mine = chat('a', [
      ['user', 'Text Mum', 1],
      ['assistant', 'Ready to send', 2],
    ]);
    mine.messages[1] = { ...mine.messages[1]!, actions: [{ label: 'Send' }] } as never;
    const theirs = chat(
      'a',
      [
        ['user', 'Text Mum', 5],
        ['assistant', 'Ready to send', 6],
        ['user', 'From the PC', 7],
      ],
      20,
    );
    const out = mergeChatHistory([mine], [theirs, chat('b', [['user', 'new', 3]])]);
    const a = out.find((c) => c.id === 'a')!;
    expect(a.messages.map((m) => m.text)).toEqual(['Text Mum', 'Ready to send', 'From the PC']);
    expect((a.messages[1] as { actions?: unknown[] }).actions).toHaveLength(1);
    expect(out.find((c) => c.id === 'b')).toBeTruthy();
    // Nothing new: left as it is.
    expect(mergeChatHistory([mine], [chat('a', [['user', 'Text Mum', 9]], 30)])[0]).toBe(mine);
  });
  it('sends only changed chats, without messages the PC answered itself', () => {
    const c1 = chat(
      'a',
      [
        ['user', 'hi', 1, true],
        ['assistant', 'hello', 2, true],
        ['user', 'offline one', 3],
      ],
      50,
    );
    const c2 = chat('b', [['user', 'old', 1]], 5);
    const c3 = chat('c', [['user', 'pc only', 1, true]], 60);
    const out = chatsToSend([c1, c2, c3], 10);
    expect(out.map((c) => c.id)).toEqual(['a']);
    expect(out[0]?.messages.map((m) => m.text)).toEqual(['offline one']);
  });
});

describe('Android app tools', () => {
  it('adds message, calendar, contact and shift-app tools without clashing', async () => {
    const { APP_TOOLS, PHONE_TOOLS } = await import('../phone/src/tools');
    const names = [...PHONE_TOOLS, ...APP_TOOLS].map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(APP_TOOLS.map((t) => t.name)).toEqual([
      'read_messages',
      'reply_message',
      'read_calendar',
      'find_contact',
      'media_control',
      'read_shift_app',
    ]);
  });
});
