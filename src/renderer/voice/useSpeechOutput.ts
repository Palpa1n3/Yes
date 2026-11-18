import { useEffect } from 'react';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useVoiceStore } from '@renderer/stores/voiceStore';
import { FishSpeaker } from './fishSpeech';
import { webSpeechOutput } from './providers';

const spoken = new Set<string>();

/** Stop whatever ARC is saying (e.g. when the mic opens). */
export let stopSpeaking: () => void = () => webSpeechOutput.cancel();

/** Reads finished replies aloud when "Speak replies" is on and voice isn't muted, in the
 *  Fish Audio voice when it's set up (falling back to the Windows voice if it fails). */
export function useSpeechOutput(): void {
  useEffect(() => {
    // Anything already on screen at startup (restored history) is not read out.
    for (const m of useConversationStore.getState().messages) spoken.add(m.id);
    const assistant = (): ReturnType<typeof useAssistantStore.getState> =>
      useAssistantStore.getState();
    let decay: ReturnType<typeof setInterval> | undefined;
    let warned = false;

    const done = (): void => {
      clearInterval(decay);
      assistant().setAudioLevel(0);
      assistant().setSpeechActive(false);
    };

    const speakSystem = (text: string): void => {
      if (!webSpeechOutput.available) return done();
      clearInterval(decay);
      decay = setInterval(() => {
        const lvl = assistant().audioLevel;
        if (lvl > 0.02) assistant().setAudioLevel(lvl * 0.82);
      }, 50);
      webSpeechOutput.speak(text, {
        voiceName: useSettingsStore.getState().settings.voiceName || undefined,
        onWord: () => assistant().setAudioLevel(0.9),
        onEnd: () => {
          if (!speechSynthesis.pending && !speechSynthesis.speaking) done();
        },
      });
    };

    const fish = new FishSpeaker({
      onLevel: (l) => assistant().setAudioLevel(l),
      onIdle: done,
      onError: (message, rest) => {
        if (!warned) {
          warned = true; // once per session
          useConversationStore
            .getState()
            .pushSystem(
              `Fish Audio voice unavailable: ${message} Using the Windows voice.`,
              'error',
            );
        }
        speakSystem(rest);
      },
    });

    stopSpeaking = () => {
      fish.cancel();
      webSpeechOutput.cancel();
      done();
    };

    const unsub = useConversationStore.subscribe((s) => {
      const { speakReplies, voiceMuted, voiceEngine } = useSettingsStore.getState().settings;
      const useFish = voiceEngine === 'fish' && useVoiceStore.getState().status.fishKey;
      for (const m of s.messages) {
        if (m.role !== 'assistant' || m.streaming || spoken.has(m.id)) continue;
        spoken.add(m.id);
        if (!speakReplies || voiceMuted || (!useFish && !webSpeechOutput.available)) continue;
        assistant().setSpeechActive(true);
        if (useFish) fish.speak(m.text);
        else speakSystem(m.text);
      }
    });

    // Muting (or switching voice) mid-sentence stops speech immediately.
    const unsubSettings = useSettingsStore.subscribe((s, prev) => {
      const off = (x: typeof s.settings): boolean => x.voiceMuted || !x.speakReplies;
      if (
        (off(s.settings) && !off(prev.settings)) ||
        s.settings.voiceEngine !== prev.settings.voiceEngine
      )
        stopSpeaking();
    });

    return () => {
      unsub();
      unsubSettings();
      stopSpeaking();
    };
  }, []);
}
