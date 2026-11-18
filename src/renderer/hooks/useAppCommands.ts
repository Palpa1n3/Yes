import { useEffect } from 'react';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { useUiStore } from '@renderer/stores/uiStore';
import { toggleListening } from '@renderer/voice/useSpeechInput';

export const FOCUS_INPUT_EVENT = 'arc:focus-input';

/** Handles requests from the main process (global hotkey, tray menu). */
export function useAppCommands(compact: boolean): void {
  useEffect(
    () =>
      window.arc.app.onCommand((c) => {
        switch (c.type) {
          case 'focus-input':
            // The console lives on Overview; the compact pill always has its own input.
            if (!compact) useUiStore.getState().setTab('overview');
            requestAnimationFrame(() => window.dispatchEvent(new Event(FOCUS_INPUT_EVENT)));
            break;
          case 'open-settings':
            useUiStore.getState().openSettings();
            break;
          case 'voice-toggle':
            toggleListening();
            break;
          case 'notice':
            useConversationStore.getState().pushSystem(c.text);
            break;
        }
      }),
    [compact],
  );
}
