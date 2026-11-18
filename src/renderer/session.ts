import { pickGreeting, resolveTitle } from '@shared/personalities';
import { BOOT_MS, shouldBoot } from '@renderer/components/core/BootSequence';
import { useAppsStore } from '@renderer/stores/appsStore';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';

/** Startup: load settings, restore the saved conversation, then greet (or run startup routines). */
export async function startSession(): Promise<void> {
  const settings = await window.arc.settings.get();
  useSettingsStore.setState({ settings, loaded: true });
  void useAppsStore.getState().load(); // friendly names for command cards

  const conv = useConversationStore.getState();
  if (conv.messages.length > 0) return; // hot reload: keep what's on screen

  const saved = settings.persistHistory ? await window.arc.history.get() : [];
  if (saved.length > 0) {
    conv.restore([
      ...saved,
      {
        id: `session-restore-${Date.now()}`,
        role: 'system',
        text: `Restored ${saved.length} messages from your last session · /clear to start fresh`,
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
