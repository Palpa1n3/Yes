/** Saved prompts: the user's own slash commands ("/fix", "/summarize"...). {text} is
 *  replaced with what follows the command, or with the clipboard when nothing does. */

export interface SavedPrompt {
  /** Lower-case, no slash: "fix", "email-reply". */
  name: string;
  text: string;
}

export const MAX_PROMPTS = 30;
export const PROMPT_TEXT_MAX = 2000;
/** Built-in slash commands a saved prompt can't replace. */
export const RESERVED_PROMPT_NAMES = [
  'help',
  'clear',
  'settings',
  'mode',
  'personality',
  'focus',
  'prompts',
  'download',
  'saver',
];

export const DEFAULT_PROMPTS: SavedPrompt[] = [
  { name: 'summarize', text: 'Summarise this in a few short bullet points:\n\n{text}' },
  {
    name: 'fix',
    text: 'Fix the spelling and grammar and keep my tone. Reply with only the corrected text:\n\n{text}',
  },
  { name: 'explain', text: 'Explain this simply, like I am new to it:\n\n{text}' },
  {
    name: 'translate',
    text: 'Translate this into English. If it is already English, translate it into Spanish. Reply with only the translation:\n\n{text}',
  },
  { name: 'reply', text: 'Write a short, friendly reply to this message:\n\n{text}' },
  {
    name: 'shorter',
    text: 'Make this shorter and clearer, keeping the meaning. Reply with only the new version:\n\n{text}',
  },
];

/** "/Email Reply!" → "email-reply" ('' if nothing usable is left). */
export function promptName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^\/+/, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
}

export function sanitizePrompts(v: unknown): SavedPrompt[] {
  if (!Array.isArray(v)) return DEFAULT_PROMPTS.map((p) => ({ ...p }));
  const seen = new Set<string>();
  const out: SavedPrompt[] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const name = promptName(typeof o['name'] === 'string' ? o['name'] : '');
    const text = typeof o['text'] === 'string' ? o['text'].trim().slice(0, PROMPT_TEXT_MAX) : '';
    if (!name || !text || seen.has(name) || RESERVED_PROMPT_NAMES.includes(name)) continue;
    seen.add(name);
    out.push({ name, text });
    if (out.length >= MAX_PROMPTS) break;
  }
  return out;
}

/** Fill in {text}. With no placeholder, the text goes after the prompt. */
export function expandPrompt(p: SavedPrompt, text: string): string {
  const t = text.trim();
  if (p.text.includes('{text}')) return p.text.split('{text}').join(t).trim();
  return t ? `${p.text}\n\n${t}` : p.text;
}

/** Does this prompt need some text to work on? */
export const needsText = (p: SavedPrompt): boolean => p.text.includes('{text}');

/** "/fix some words" → the prompt and "some words"; null if it isn't one. */
export function matchPromptCommand(
  input: string,
  prompts: SavedPrompt[],
): { prompt: SavedPrompt; rest: string } | null {
  const m = input.trim().match(/^\/([a-z0-9-]+)(?:\s+([\s\S]*))?$/i);
  if (!m) return null;
  const name = (m[1] ?? '').toLowerCase();
  const prompt = prompts.find((p) => p.name === name);
  return prompt ? { prompt, rest: m[2] ?? '' } : null;
}
