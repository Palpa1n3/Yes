import { useEffect } from 'react';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { webSpeechOutput } from './providers';

const spoken = new Set<string>();

/** Reads finished replies aloud when "Speak replies" is on and voice isn't muted.
 *  Word boundaries pulse the core via the shared audioLevel. */
export function useSpeechOutput(): void {
  useEffect(() => {
    // Anything already on screen at startup (restored history) is not read out.
    for (const m of useConversationStore.getState().messages) spoken.add(m.id);
    let decay: ReturnType<typeof setInterval> | undefined;

    const unsub = useConversationStore.subscribe((s) => {
      const { speakReplies, voiceMuted, voiceName } = useSettingsStore.getState().settings;
      for (const m of s.messages) {
        if (m.role !== 'assistant' || m.streaming || spoken.has(m.id)) continue;
        spoken.add(m.id);
        if (!speakReplies || voiceMuted || !webSpeechOutput.available) continue;
        const a = useAssistantStore.getState();
        a.setSpeechActive(true);
        clearInterval(decay);
        decay = setInterval(() => {
          const lvl = useAssistantStore.getState().audioLevel;
          if (lvl > 0.02) useAssistantStore.getState().setAudioLevel(lvl * 0.82);
        }, 50);
        webSpeechOutput.speak(m.text, {
          voiceName: voiceName || undefined,
          onWord: () => useAssistantStore.getState().setAudioLevel(0.9),
          onEnd: () => {
            clearInterval(decay);
            const st = useAssistantStore.getState();
            st.setAudioLevel(0);
            st.setSpeechActive(false);
          },
        });
      }
    });

    // Muting mid-sentence stops speech immediately.
    const unsubSettings = useSettingsStore.subscribe((s, prev) => {
      const off = (x: typeof s.settings): boolean => x.voiceMuted || !x.speakReplies;
      if (off(s.settings) && !off(prev.settings)) webSpeechOutput.cancel();
    });

    return () => {
      unsub();
      unsubSettings();
      clearInterval(decay);
      webSpeechOutput.cancel();
    };
  }, []);
}
