/** Personality is data, not code. Presets live here; users customise a copy in Settings.
 *  Phrases may use {,title} → ", sir" (or nothing if the title is empty) and {title}. */

export type Tone = 'formal' | 'warm' | 'dry-wit' | 'concise' | 'playful';
export type ConfirmMode = 'always' | 'destructive-only' | 'never';

export interface Personality {
  id: string;
  name: string; // "Butler"
  assistantName: string; // mirrors Settings.assistantName (kept for export/import)
  /** How ARC addresses you: "sir", "boss", "{name}" (your first name) or "". */
  userTitle: string;
  tone: Tone;
  verbosity: 1 | 2 | 3 | 4 | 5;
  humour: 0 | 1 | 2 | 3;
  proactivity: 0 | 1 | 2;
  confirmBeforeActions: ConfirmMode;
  greetings: { morning: string[]; afternoon: string[]; evening: string[]; lateNight: string[] };
  acknowledgements: string[];
  errorPhrases: string[];
  /** Generated from the fields above (buildSystemPrompt) and sent to a real model later. */
  systemPrompt: string;
}

export type DayPart = keyof Personality['greetings'];

/** Late night is 00:00–05:00. */
export function dayPart(hour: number): DayPart {
  if (hour < 5) return 'lateNight';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

type Preset = Omit<Personality, 'systemPrompt' | 'assistantName'>;

const PRESETS_RAW: Preset[] = [
  {
    id: 'butler',
    name: 'Butler',
    userTitle: 'sir',
    tone: 'dry-wit',
    verbosity: 2,
    humour: 2,
    proactivity: 1,
    confirmBeforeActions: 'destructive-only',
    greetings: {
      morning: [
        'Good morning{,title}. All systems are nominal.',
        'Good morning{,title}. Coffee first, or straight to work?',
      ],
      afternoon: [
        'Good afternoon{,title}. All systems are nominal.',
        'Good afternoon{,title}. What shall we tackle?',
      ],
      evening: [
        'Good evening{,title}. All systems are nominal. Shall I open your last project?',
        'Good evening{,title}. Everything is running smoothly.',
      ],
      lateNight: [
        'Working late again{,title}? All systems are nominal.',
        'Burning the midnight oil{,title}? I shall keep the lights on.',
      ],
    },
    acknowledgements: [
      'Right away{,title}.',
      'Very good{,title}.',
      'One moment{,title}.',
      'Certainly{,title}.',
    ],
    errorPhrases: [
      "I'm afraid that didn't work{,title}.",
      "That didn't go to plan.",
      'Apologies{,title}. No luck there.',
    ],
  },
  {
    id: 'copilot',
    name: 'Co-pilot',
    userTitle: '{name}',
    tone: 'warm',
    verbosity: 3,
    humour: 1,
    proactivity: 2,
    confirmBeforeActions: 'destructive-only',
    greetings: {
      morning: [
        'Morning{,title}! Ready when you are.',
        'Good morning{,title}. Here if you need me.',
      ],
      afternoon: [
        'Hey{,title}, good afternoon. What are we working on?',
        'Afternoon{,title}! Need a hand?',
      ],
      evening: [
        'Evening{,title}. Want me to open your last project?',
        'Hey{,title}, good evening.',
      ],
      lateNight: [
        'Still up{,title}? I can help you wrap things up.',
        'Late one tonight{,title}. Let me know what you need.',
      ],
    },
    acknowledgements: ['On it!', 'Sure thing.', 'Doing that now.', 'You got it.'],
    errorPhrases: ["Hmm, that didn't work.", 'That one failed, sorry.', 'No luck with that one.'],
  },
  {
    id: 'terminal',
    name: 'Terminal',
    userTitle: '',
    tone: 'concise',
    verbosity: 1,
    humour: 0,
    proactivity: 0,
    confirmBeforeActions: 'never',
    greetings: {
      morning: ['Online.'],
      afternoon: ['Online.'],
      evening: ['Online.'],
      lateNight: ['Online.'],
    },
    acknowledgements: ['OK.', 'Executing.'],
    errorPhrases: ['Failed.', 'Error.'],
  },
  {
    id: 'mentor',
    name: 'Mentor',
    userTitle: '{name}',
    tone: 'warm',
    verbosity: 5,
    humour: 1,
    proactivity: 1,
    confirmBeforeActions: 'always',
    greetings: {
      morning: [
        "Good morning{,title}. I'll explain what I do as we go, so you can pick up the shortcuts too.",
      ],
      afternoon: ["Good afternoon{,title}. Ask me anything and I'll walk you through it."],
      evening: ["Good evening{,title}. I'll explain each step as we go."],
      lateNight: ["It's late{,title}. Let's keep it simple; I'll explain as we go."],
    },
    acknowledgements: ["Sure. Here's what I'll do:", 'Good idea. Step by step:'],
    errorPhrases: [
      "That didn't work, and here's why:",
      "That failed. Let's look at what happened:",
    ],
  },
];

const TONE_TEXT: Record<Tone, string> = {
  formal: 'formal and polite',
  warm: 'warm and friendly',
  'dry-wit': 'formal, with a dry, understated wit',
  concise: 'terse and businesslike; no small talk',
  playful: 'playful and upbeat',
};

/** Turn a personality into instructions for a language model. */
export function buildSystemPrompt(p: Omit<Personality, 'systemPrompt'>, userName = ''): string {
  const title = resolveTitle(p.userTitle, userName);
  const lines = [
    `You are ${p.assistantName}, a desktop assistant running on the user's computer.`,
    `Tone: ${TONE_TEXT[p.tone]}.`,
    title ? `Address the user as "${title}".` : 'Do not use a form of address for the user.',
    [
      'Keep replies to a few words; confirm actions only.',
      'Keep replies short: one or two sentences.',
      'Reply in a few sentences.',
      'Explain briefly what you are doing.',
      'Explain what you are doing and why, step by step, so the user learns.',
    ][p.verbosity - 1],
    [
      'Never joke.',
      'An occasional light remark is fine.',
      'Dry humour is welcome when appropriate.',
      'Feel free to add frequent dry quips.',
    ][p.humour],
    [
      'Only respond to what is asked.',
      'Offer a suggestion when clearly useful.',
      'Proactively suggest next steps.',
    ][p.proactivity],
    'To act on the computer, call a tool rather than describing the action.',
  ];
  return lines.filter(Boolean).join('\n');
}

export const PRESETS: Personality[] = PRESETS_RAW.map((p) => {
  const full = { ...p, assistantName: 'ARC' };
  return { ...full, systemPrompt: buildSystemPrompt(full) };
});

export const DEFAULT_PERSONALITY: Personality = PRESETS[0] as Personality;

export const presetById = (id: string): Personality | undefined => PRESETS.find((p) => p.id === id);

/** "{name}" → the user's first name; anything else is used as written. */
export function resolveTitle(userTitle: string, userName: string): string {
  return userTitle.trim() === '{name}' ? userName.trim() : userTitle.trim();
}

/** Fill {,title} and {title}; tidy spacing if the title is empty. */
export function renderPhrase(phrase: string, title: string): string {
  return phrase
    .replace(/\{,title\}/g, title ? `, ${title}` : '')
    .replace(/\{title\}/g, title)
    .replace(/\s+([.,!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function pickPhrase(list: readonly string[], title: string, seed = Math.random()): string {
  if (list.length === 0) return '';
  return renderPhrase(list[Math.floor(seed * list.length) % list.length] ?? '', title);
}

export function pickGreeting(p: Personality, title: string, hour: number, seed?: number): string {
  return pickPhrase(p.greetings[dayPart(hour)], title, seed);
}

/** Validate a stored personality, falling back to defaults field by field. */
export function sanitizePersonality(raw: unknown): Personality {
  const base = DEFAULT_PERSONALITY;
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Personality>;
  const inRange = <T extends number>(v: unknown, lo: number, hi: number, d: T): T =>
    typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? (v as T) : d;
  const strs = (v: unknown, d: string[]): string[] =>
    Array.isArray(v) && v.every((x) => typeof x === 'string') && v.length ? v : d;
  const g = (r.greetings ?? {}) as Partial<Personality['greetings']>;
  const p: Omit<Personality, 'systemPrompt'> = {
    id: typeof r.id === 'string' ? r.id : base.id,
    name: typeof r.name === 'string' && r.name.trim() ? r.name : base.name,
    assistantName:
      typeof r.assistantName === 'string' && r.assistantName.trim()
        ? r.assistantName
        : base.assistantName,
    userTitle: typeof r.userTitle === 'string' ? r.userTitle : base.userTitle,
    tone: (['formal', 'warm', 'dry-wit', 'concise', 'playful'] as const).includes(r.tone as Tone)
      ? (r.tone as Tone)
      : base.tone,
    verbosity: inRange(r.verbosity, 1, 5, base.verbosity),
    humour: inRange(r.humour, 0, 3, base.humour),
    proactivity: inRange(r.proactivity, 0, 2, base.proactivity),
    confirmBeforeActions: (['always', 'destructive-only', 'never'] as const).includes(
      r.confirmBeforeActions as ConfirmMode,
    )
      ? (r.confirmBeforeActions as ConfirmMode)
      : base.confirmBeforeActions,
    greetings: {
      morning: strs(g.morning, base.greetings.morning),
      afternoon: strs(g.afternoon, base.greetings.afternoon),
      evening: strs(g.evening, base.greetings.evening),
      lateNight: strs(g.lateNight, base.greetings.lateNight),
    },
    acknowledgements: strs(r.acknowledgements, base.acknowledgements),
    errorPhrases: strs(r.errorPhrases, base.errorPhrases),
  };
  return { ...p, systemPrompt: buildSystemPrompt(p) };
}
