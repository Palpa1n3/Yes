import { useAvatarLife } from '@renderer/hooks/useAvatarLife';
import { AmbientBack, AmbientTint } from '@renderer/components/hud/Ambient';
import { Screensaver, SCREENSAVER_EVENT } from '@renderer/components/hud/Screensaver';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useEffect, useState, type ComponentType, useCallback } from 'react';
import { Background, SpaceBackdropLayer } from '@renderer/components/hud/Background';
import { StatusBar } from '@renderer/components/hud/StatusBar';
import { TopBar } from '@renderer/components/hud/TopBar';
import { AppsTab } from '@renderer/components/tabs/AppsTab';
import { NetworkTab } from '@renderer/components/tabs/NetworkTab';
import { OverviewTab } from '@renderer/components/tabs/OverviewTab';
import { RoutinesTab } from '@renderer/components/tabs/RoutinesTab';
import { StorageTab } from '@renderer/components/tabs/StorageTab';
import { SystemTab } from '@renderer/components/tabs/SystemTab';
import { ChatTab } from '@renderer/components/tabs/ChatTab';
import { NotesTab } from '@renderer/components/tabs/NotesTab';
import { TasksTab } from '@renderer/components/tabs/TasksTab';
import { bindDevStateKeys, DevStateSwitcher } from '@renderer/components/core/DevStateSwitcher';
import { useFakeAudio } from '@renderer/hooks/useFakeAudio';
import { SettingsPanel } from '@renderer/components/settings/SettingsPanel';
import { DropZone } from '@renderer/components/hud/DropZone';
import { startSession } from '@renderer/session';
import {
  bindAssistantStream,
  bindHistoryPersistence,
  useConversationStore,
} from '@renderer/stores/conversationStore';
import { bindWeather } from '@renderer/stores/weatherStore';
import { bindVoice } from '@renderer/stores/voiceStore';
import { bindChats } from '@renderer/stores/chatsStore';
import { bindNotes } from '@renderer/stores/notesStore';
import { bindMedia } from '@renderer/stores/mediaStore';
import { bindEmail } from '@renderer/stores/emailStore';
import { bindUpdates } from '@renderer/stores/updatesStore';
import { bindClipboard } from '@renderer/stores/clipboardStore';
import { bindGaming } from '@renderer/stores/gamingStore';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import { bindCalendar } from '@renderer/stores/calendarStore';
import { bindRoutines } from '@renderer/stores/routinesStore';
import { bindTimers, timerTitle, useTimersStore } from '@renderer/stores/timersStore';
import { startAlarm, stopAlarm } from '@renderer/voice/alarm';
import { RingingBanner } from '@renderer/components/hud/RingingBanner';
import { AgentPanel } from '@renderer/components/hud/AgentPanel';
import { ApprovalCards, bindApprovals } from '@renderer/components/hud/ApprovalCards';
import { SuggestionToast, bindSuggestions } from '@renderer/components/hud/SuggestionToast';
import { bindAgent } from '@renderer/stores/agentStore';
import { useSpeechOutput } from '@renderer/voice/useSpeechOutput';
import { useWakeWord } from '@renderer/voice/useWakeWord';
import { BootSequence, shouldBoot } from '@renderer/components/core/BootSequence';
import { SetupGuide, SETUP_EVENT } from '@renderer/components/hud/SetupGuide';
import { CompactView } from '@renderer/components/hud/CompactView';
import { useReducedMotion } from '@renderer/hooks/useReducedMotion';
import { TABS } from '@renderer/components/tabs/registry';
import { useAppCommands } from '@renderer/hooks/useAppCommands';
import { useTelemetry } from '@renderer/hooks/useTelemetry';
import { useWindowState } from '@renderer/hooks/useWindowState';
import { bindSettingsSync, useSettingsStore } from '@renderer/stores/settingsStore';
import { useUiStore, type TabId } from '@renderer/stores/uiStore';
import { applyTheme } from '@renderer/themes/themes';

const VIEWS: Record<TabId, ComponentType> = {
  overview: OverviewTab,
  chat: ChatTab,
  notes: NotesTab,
  system: SystemTab,
  tasks: TasksTab,
  apps: AppsTab,
  network: NetworkTab,
  storage: StorageTab,
  routines: RoutinesTab,
};

export function App() {
  const { settings, loaded } = useSettingsStore();
  const reduced = useReducedMotion();
  const [booting, setBooting] = useState<boolean | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  useAvatarLife();
  const [screensaver, setScreensaver] = useState(false);
  const closeScreensaver = useCallback(() => setScreensaver(false), []);
  useEffect(() => {
    const on = (e: Event): void => setScreensaver((e as CustomEvent<boolean>).detail === true);
    window.addEventListener(SCREENSAVER_EVENT, on);
    return () => window.removeEventListener(SCREENSAVER_EVENT, on);
  }, []);
  useEffect(() => {
    const open = (): void => setSetupOpen(true);
    window.addEventListener(SETUP_EVENT, open);
    return () => window.removeEventListener(SETUP_EVENT, open);
  }, []);

  // Decide once settings have loaded (the boot toggle lives there).
  useEffect(() => {
    if (loaded && booting === null) setBooting(shouldBoot(settings.bootSequence, reduced));
  }, [loaded, booting, settings.bootSequence, reduced]);
  const tab = useUiStore((s) => s.tab);
  const { maximized, compact } = useWindowState();
  useTelemetry();
  useFakeAudio();
  useAppCommands(compact);
  useSpeechOutput();
  useWakeWord();

  useEffect(() => bindSettingsSync(), []);

  useEffect(() => (import.meta.env.DEV ? bindDevStateKeys() : undefined), []);

  useEffect(() => {
    const offStream = bindAssistantStream();
    const offHistory = bindHistoryPersistence();
    void startSession();
    return () => {
      offStream();
      offHistory();
    };
  }, []);

  useEffect(() => bindWeather(), []);
  useEffect(() => bindVoice(), []);
  useEffect(() => {
    document.title = settings.assistantName;
  }, [settings.assistantName]);
  useEffect(() => bindChats(), []);
  useEffect(() => bindNotes(), []);
  useEffect(() => bindMedia(), []);
  useEffect(() => bindEmail(), []);
  useEffect(() => bindUpdates(), []);
  useEffect(() => bindSuggestions(), []);
  useEffect(() => bindApprovals(), []);
  useEffect(
    () =>
      bindAgent({
        say: (t) => useConversationStore.getState().pushAssistant(t),
        note: (t, tone) => useConversationStore.getState().pushSystem(t, tone),
      }),
    [],
  );
  useEffect(() => bindClipboard((text) => useConversationStore.getState().pushAssistant(text)), []);
  useEffect(
    () =>
      bindGaming((s, prev) => {
        const log = useAssistantStore.getState().logActivity;
        if (s.active && !prev.active)
          log({
            kind: 'sys',
            label: `Gaming mode on${s.game ? ` (${s.game})` : ''}${s.actions.length ? `: ${s.actions.join(', ')}` : ''}`,
            status: 'success',
          });
        else if (!s.active && prev.active)
          log({ kind: 'sys', label: 'Gaming mode off: settings put back', status: 'success' });
      }),
    [],
  );
  useEffect(() => bindCalendar((text) => useConversationStore.getState().pushAssistant(text)), []);
  useEffect(() => bindRoutines((text) => useConversationStore.getState().pushAssistant(text)), []);

  // Timers: mirror main's list; ring → alarm sound + a console line; silence when none ring.
  useEffect(() => {
    const off = bindTimers((t) => {
      startAlarm();
      useConversationStore.getState().pushSystem(`⏰ Time's up: ${timerTitle(t)}`);
    });
    const unsub = useTimersStore.subscribe((st) => {
      if (!st.timers.some((t) => t.status === 'ringing')) stopAlarm();
      else startAlarm();
    });
    return () => {
      off();
      unsub();
      stopAlarm();
    };
  }, []);

  // Ctrl+, opens settings (Esc inside the panel closes it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        useUiStore.getState().openSettings();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  const View = VIEWS[tab];

  if (compact) {
    return (
      <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
        <div className="app-shell" data-compact="true">
          <Background scanlines={settings.scanlines} particles={settings.particles} />
          <CompactView />
        </div>
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      <div className="app-shell" data-maximized={maximized}>
        <Background scanlines={settings.scanlines} particles={settings.particles} />
        <SpaceBackdropLayer />
        <AmbientBack />
        <AmbientTint />
        {screensaver && <Screensaver onClose={closeScreensaver} />}
        <TopBar assistantName={settings.assistantName} maximized={maximized} />
        <main className="relative z-10 min-h-0 flex-1 px-5 pb-2 pt-4">
          <h1 className="sr-only">
            {settings.assistantName}: {TABS.find((t) => t.id === tab)?.label}
          </h1>
          <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="h-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                className="h-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
              >
                <View />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
        <StatusBar />
        <SettingsPanel />
        <DropZone />
        <RingingBanner />
        <AgentPanel />
        <ApprovalCards />
        <SuggestionToast />
        {import.meta.env.DEV && <DevStateSwitcher />}
        {booting && <BootSequence onDone={() => setBooting(false)} />}
        {!booting && (setupOpen || !settings.onboarded) && (
          <SetupGuide onClose={() => setSetupOpen(false)} />
        )}
      </div>
    </MotionConfig>
  );
}
