import { useVoiceStore } from '@renderer/stores/voiceStore';
import { cancelListening } from '@renderer/voice/useSpeechInput';
import { stopSpeaking } from '@renderer/voice/useSpeechOutput';

/** "Stop everything": Agent Mode, a running routine, speech, listening and open mic.
 *  (The reply in progress is cancelled by the caller.) */
export function emergencyStop(): void {
  window.arc.agent.stop();
  window.arc.routines.stop();
  stopSpeaking();
  cancelListening();
  if (useVoiceStore.getState().openMic) useVoiceStore.setState({ openMic: false });
}

export const EMERGENCY_RE =
  /^(?:stop everything|emergency stop|stop all|stop it all|abort everything|kill switch)$/i;
