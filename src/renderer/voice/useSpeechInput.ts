import { useCallback, useEffect, useRef } from 'react';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import { deriveState, useConversationStore } from '@renderer/stores/conversationStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useVoiceStore } from '@renderer/stores/voiceStore';
import { startMic, type MicSession } from './mic';
import { stopSpeaking } from './useSpeechOutput';

/** A press shorter than this is a click: keep listening until the user goes quiet. */
const HOLD_MS = 400;

let session: MicSession | null = null;
let pressedAt = 0;
let toggled = false;

const settle = (): void => {
  const a = useAssistantStore.getState();
  if (a.state === 'listening' || a.stateDetail === 'Transcribing')
    a.setState(deriveState(useConversationStore.getState()));
};

async function finish(cancel = false): Promise<void> {
  const s = session;
  if (!s) return;
  session = null;
  toggled = false;
  const conv = useConversationStore.getState();
  if (cancel || !s.heardSpeech()) {
    s.cancel();
    useVoiceStore.setState({ mic: 'idle' });
    settle();
    if (!cancel) conv.pushSystem("I didn't hear anything. Click the mic and speak.");
    return;
  }
  const audio = s.stop();
  useVoiceStore.setState({ mic: 'transcribing' });
  useAssistantStore.getState().setState('thinking', 'Transcribing');
  const st = useVoiceStore.getState().status.stt;
  if (st.state !== 'ready')
    conv.pushSystem(
      st.state === 'downloading' || st.state === 'idle'
        ? 'Getting the speech model ready (a one-off download). Your words will appear in a moment.'
        : 'Loading the speech model…',
    );
  try {
    const text = await window.arc.voice.transcribe(audio);
    useVoiceStore.setState({ mic: 'idle' });
    settle();
    if (text) await useConversationStore.getState().send(text);
    else
      conv.pushSystem(
        "Sorry, I couldn't make out any words. Try again a little closer to the mic.",
      );
  } catch (err) {
    useVoiceStore.setState({ mic: 'idle' });
    settle();
    const msg =
      useVoiceStore.getState().status.stt.error ??
      (err instanceof Error
        ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
        : 'Transcription failed.');
    conv.pushSystem(msg, 'error');
  }
}

async function begin(): Promise<void> {
  if (session || useVoiceStore.getState().mic !== 'idle') return;
  stopSpeaking(); // don't record ARC's own voice
  window.arc.voice.prepare(); // load (or start downloading) the model while the user talks
  useVoiceStore.setState({ mic: 'listening' });
  useAssistantStore.getState().setState('listening');
  try {
    session = await startMic({
      onLevel: (l) => useAssistantStore.getState().setAudioLevel(l),
      onAutoStop: () => void finish(),
    });
    // Released before the mic even opened (a quick click): listen until quiet.
    if (pressedAt === 0) toggled = true;
  } catch (err) {
    session = null;
    useVoiceStore.setState({ mic: 'idle' });
    settle();
    const name = err instanceof Error ? err.name : '';
    useConversationStore
      .getState()
      .pushSystem(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'ARC is not allowed to use the microphone. In Windows Settings › Privacy & security › Microphone, turn on “Let desktop apps access your microphone”.'
          : name === 'NotFoundError'
            ? 'No microphone found. Plug one in (or check it is enabled in Windows sound settings).'
            : `The microphone could not start: ${err instanceof Error ? err.message : String(err)}`,
        'error',
      );
  }
}

/** Mic button: click to talk (stops when you pause), or hold and release to send. */
export function useSpeechInput(): {
  press(): void;
  release(): void;
  available: boolean;
} {
  const enabled = useSettingsStore((s) => s.settings.voiceInput);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const press = useCallback(() => {
    if (!enabled) {
      useConversationStore
        .getState()
        .pushSystem('Voice input is off. Turn it on in Settings › Voice.');
      return;
    }
    if (session && toggled) {
      void finish(); // second click: done talking
      return;
    }
    pressedAt = performance.now();
    void begin();
  }, [enabled]);

  const release = useCallback(() => {
    if (!pressedAt) return;
    const held = performance.now() - pressedAt;
    pressedAt = 0;
    if (!session) return; // still opening; begin() marks it as click-to-talk
    if (held < HOLD_MS) toggled = true;
    else void finish();
  }, []);

  return { press, release, available: enabled };
}

/** Esc while listening throws the recording away. */
export function cancelListening(): boolean {
  if (!session) return false;
  void finish(true);
  return true;
}

/** Keybind / wake word: start listening (click-to-talk style), or finish if already listening. */
export function toggleListening(): void {
  if (!useSettingsStore.getState().settings.voiceInput) {
    useConversationStore
      .getState()
      .pushSystem('Voice input is off. Turn it on in Settings › Voice.');
    return;
  }
  if (session) {
    void finish();
    return;
  }
  pressedAt = 0;
  void begin();
}

export const isListening = (): boolean =>
  session !== null || useVoiceStore.getState().mic !== 'idle';
