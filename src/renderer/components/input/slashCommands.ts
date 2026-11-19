import { PREFILL_EVENT } from '@renderer/components/transcript/Transcript';
import { expandPrompt, needsText, type SavedPrompt } from '@shared/prompts';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { useUiStore, type SettingsTab } from '@renderer/stores/uiStore';

const openSettings = (tab: SettingsTab): void => useUiStore.getState().openSettings(tab);

export interface SlashCommand {
  name: string; // "/clear"
  hint: string;
  /** `rest` = text typed after the command ("/focus 50", "/fix my text"). */
  run(rest?: string): void;
  /** A saved prompt (shown with a different hint style). */
  prompt?: boolean;
}

/** Puts text back in the command line (e.g. "/fix " when there's nothing to fix yet). */
const prefill = (text: string): void => {
  window.dispatchEvent(new CustomEvent(PREFILL_EVENT, { detail: text }));
};

/** A saved prompt as a slash command. Without text after it, it uses the clipboard
 *  (or `clip`, when the clipboard shortcut opened the palette). */
export function promptCommand(p: SavedPrompt, clip?: string): SlashCommand {
  const firstLine = p.text.split('\n')[0] ?? '';
  return {
    name: `/${p.name}`,
    hint: firstLine.replace('{text}', '…').slice(0, 70),
    prompt: true,
    run: (rest = '') => {
      const go = (text: string): void => {
        if (needsText(p) && !text.trim()) {
          say(`Type or copy some text first, then use /${p.name}.`);
          prefill(`/${p.name} `);
          return;
        }
        void useConversationStore.getState().send(expandPrompt(p, text));
      };
      if (rest.trim() || clip !== undefined || !needsText(p)) return go(rest.trim() || clip || '');
      void window.arc.clipboard
        .read()
        .catch(() => '')
        .then(go);
    },
  };
}

function startFocus(rest = ''): void {
  const n = Number(rest.match(/\d+/)?.[0] ?? 25);
  const minutes = Math.min(Math.max(n, 1), 240);
  void window.arc.timers
    .add(minutes, 'Focus session', 'focus')
    .then(() =>
      say(`Focus session for ${minutes} minutes. Suggestions and alerts stay quiet until it ends.`),
    );
}

const say = (text: string): void => useConversationStore.getState().pushSystem(text);

/** Slash commands handled locally (never sent to the AI). */
export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: '/help',
    hint: 'What I can do',
    run: () =>
      say(
        'Try: “open spotify”, “close opera”, “volume 30”, “pause”, “next song”, “open my downloads”, “find invoice”, “remind me in 10 minutes to stretch”, “lock my pc”, “search for cheap flights”, “how’s my system?”.\nKeys: ↑/↓ history · Esc clear or stop · / commands · Ctrl+Space show/hide from anywhere.',
      ),
  },
  {
    name: '/clear',
    hint: 'Clear the transcript',
    run: () => useConversationStore.getState().clear(),
  },
  { name: '/settings', hint: 'Open settings', run: () => openSettings('general') },
  {
    name: '/mode compact',
    hint: 'Shrink to the compact pill',
    run: () => window.arc.window.setCompact(true),
  },
  {
    name: '/mode full',
    hint: 'Back to the full HUD',
    run: () => window.arc.window.setCompact(false),
  },
  { name: '/personality', hint: 'Personality settings', run: () => openSettings('personality') },
  {
    name: '/focus',
    hint: 'Focus session (25 min, or /focus 50): no suggestions or alerts',
    run: startFocus,
  },
  { name: '/prompts', hint: 'Edit your saved prompts', run: () => openSettings('smart') },
];

/** Built-ins plus the user's saved prompts. */
export function allCommands(prompts: SavedPrompt[] = [], clip?: string): SlashCommand[] {
  return [...SLASH_COMMANDS, ...prompts.map((p) => promptCommand(p, clip))];
}

/** "/focus 50" or "/fix some text": the command and what follows it. */
export function matchWithArgs(
  input: string,
  prompts: SavedPrompt[],
): { cmd: SlashCommand; rest: string } | null {
  const m = input.trim().match(/^(\/[a-z0-9-]+)(?:\s+([\s\S]*))?$/i);
  if (!m) return null;
  const name = (m[1] ?? '').toLowerCase();
  const cmd = allCommands(prompts).find((c) => c.name === name);
  return cmd ? { cmd, rest: m[2] ?? '' } : null;
}

export function matchSlash(input: string, prompts: SavedPrompt[] = []): SlashCommand[] {
  if (!input.startsWith('/')) return [];
  const q = input.toLowerCase().trim();
  return allCommands(prompts).filter(
    (c) => c.name.startsWith(q) || (q.length > 1 && c.name.includes(q.slice(1))),
  );
}
