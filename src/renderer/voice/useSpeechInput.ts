import { useCallback, useRef } from 'react';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import { deriveState, useConversationStore } from '@renderer/stores/conversationStore';
import { unavailableSpeechInput, type SpeechInputProvider } from './providers';

/** Push-to-talk. Drives the core's `listening` state; transcribed text is sent as a
 *  message once a real provider exists. Today it explains that voice input is pending. */
export function useSpeechInput(provider: SpeechInputProvider = unavailableSpeechInput): {
  start(): void;
  stop(): void;
  available: boolean;
} {
  const explained = useRef(false);

  const start = useCallback(() => {
    useAssistantStore.getState().setState('listening');
    provider.start({
      onText: (text, final) => {
        if (final && text.trim()) void useConversationStore.getState().send(text);
      },
      onLevel: (l) => useAssistantStore.getState().setAudioLevel(l),
      onError: (msg) => {
        if (explained.current) return;
        explained.current = true; // say it once per session, not on every press
        useConversationStore.getState().pushSystem(msg);
      },
    });
  }, [provider]);

  const stop = useCallback(() => {
    provider.stop();
    const a = useAssistantStore.getState();
    if (a.state === 'listening') a.setState(deriveState(useConversationStore.getState()));
  }, [provider]);

  return { start, stop, available: provider.available };
}
