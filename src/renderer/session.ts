import { pickGreeting, resolveTitle } from '@shared/personalities';
import { BOOT_MS, shouldBoot } from '@renderer/components/core/BootSequence';
import { useAppsStore } from '@renderer/stores/appsStore';
import { useChatsStore } from '@renderer/stores/chatsStore';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';

/** Startup: load settings, restore the saved conversation, then greet (or run startup routines). */
let started = false;

export async function startSession(): Promise<void> {
  // Once per launch: React runs start-up effects twice in development, and both runs
  // would otherwise get past the checks below before either finished (double greeting).
  if (started) return;
  started = true;
  const settings = await window.arc.settings.get();
  useSettingsStore.setState({ settings, loaded: true });
  void useAppsStore.getState().load(); // friendly names for command cards

  const conv = useConversationStore.getState();
  if (conv.messages.length > 0) return; // hot reload: keep what's on screen

  // Open the chat that was active last time.
  const chats = await window.arc.chats.state();
  useChatsStore.setState(chats);
  const saved = (await window.arc.chats.open(chats.activeId)).map((m) =>
    m.role === 'assistant' ? { ...m, revealed: true } : m,
  );
  useConversationStore.setState({ chatId: chats.activeId });
  if (saved.length > 0) {
    conv.restore([
      ...saved,
      {
        id: `session-restore-${Date.now()}`,
        role: 'system',
        text: `Restored ${saved.length} messages from this chat · start a new one from the Chat tab`,
        timestamp: Date.now(),
        tone: 'info',
      },
    ]);
  }
  const { personality, userName } = settings;
  // Startup routines (e.g. the morning briefing) replace the plain greeting.
  const due = await window.arc.routines.startup().catch(() => []);
  const greet = (): void => {
    if (due.length) {
      void (async () => {
        for (const r of due)
          await useConversationStore.getState().perform({ action: 'run_routine', target: r.id });
      })();
      return;
    }
    useConversationStore
      .getState()
      .pushAssistant(
        pickGreeting(
          personality,
          resolveTitle(personality.userTitle, userName),
          new Date().getHours(),
        ),
        `session-greet-${Date.now()}`,
      );
  };
  // With the boot sequence playing, the greeting types out as it finishes.
  const reduced =
    settings.reduceMotion === 'on' ||
    (settings.reduceMotion === 'system' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  if (shouldBoot(settings.bootSequence, Boolean(reduced))) setTimeout(greet, BOOT_MS + 350);
  else greet();
}
