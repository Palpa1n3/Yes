import { useConversationStore } from '@renderer/stores/conversationStore';
import { useUiStore, type SettingsTab } from '@renderer/stores/uiStore';

const openSettings = (tab: SettingsTab): void => useUiStore.getState().openSettings(tab);

export interface SlashCommand {
  name: string; // "/clear"
  hint: string;
  run(): void;
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
];

export function matchSlash(input: string): SlashCommand[] {
  if (!input.startsWith('/')) return [];
  const q = input.toLowerCase().trim();
  return SLASH_COMMANDS.filter(
    (c) => c.name.startsWith(q) || (q.length > 1 && c.name.includes(q.slice(1))),
  );
}
