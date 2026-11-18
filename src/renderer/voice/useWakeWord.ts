import { useEffect } from 'react';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useVoiceStore } from '@renderer/stores/voiceStore';
import { useGamingStore } from '@renderer/stores/gamingStore';
import { playSfx } from './sfx';
import { isListening, toggleListening } from './useSpeechInput';
import { stopSpeaking } from './useSpeechOutput';
import { matchWake, startWakeListener } from './wakeWord';

/** Ignore the mic briefly after ARC stops talking, so it doesn't hear itself. */
const ECHO_MS = 1200;

/** "Hey ARC": listens all the time while on, transcribing only what sounds like speech. */
export function useWakeWord(): void {
  const quiet = useGamingStore((g) => g.active) && useSettingsStore.getState().settings.gamingQuiet;
  const on = useSettingsStore((s) => s.settings.wakeWord && s.settings.voiceInput) && !quiet;

  useEffect(() => {
    if (!on) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    let busy = false;
    let quietSince = 0;
    window.arc.voice.prepare();

    const unsubSpeech = useAssistantStore.subscribe((s, prev) => {
      if (prev.speechActive && !s.speechActive) quietSince = performance.now();
    });

    let lastRetry = 0;
    const onUtterance = async (audio: Float32Array): Promise<void> => {
      const a = useAssistantStore.getState();
      const stt = useVoiceStore.getState().status.stt.state;
      if (stt === 'idle' || stt === 'error') {
        // The model isn't loaded (or its download failed): try again now and then.
        if (performance.now() - lastRetry > 60_000) {
          lastRetry = performance.now();
          window.arc.voice.prepare();
        }
        return;
      }
      if (
        busy ||
        stt !== 'ready' ||
        isListening() ||
        a.speechActive ||
        performance.now() - quietSince < ECHO_MS
      )
        return;
      busy = true;
      try {
        const text = await window.arc.voice.transcribe(audio);
        const { assistantName } = useSettingsStore.getState().settings;
        const rest = matchWake(text, assistantName);
        if (rest === null) return;
        window.arc.window.peek();
        playSfx('open', true);
        stopSpeaking();
        if (rest.split(' ').filter(Boolean).length >= 2)
          await useConversationStore.getState().send(rest);
        else toggleListening(); // "Hey ARC" … then the request
      } catch {
        /* a failed transcription just means we missed one; keep listening */
      } finally {
        busy = false;
      }
    };

    startWakeListener((u) => void onUtterance(u))
      .then((s) => {
        if (cancelled) s();
        else stop = s;
      })
      .catch(() => {
        useConversationStore
          .getState()
          .pushSystem(
            `The wake word needs the microphone. Check Windows Settings › Privacy & security › Microphone.`,
            'error',
          );
      });

    return () => {
      cancelled = true;
      unsubSpeech();
      stop?.();
    };
  }, [on]);
}
