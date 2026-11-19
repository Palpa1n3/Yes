import { create } from 'zustand';
import type { VoiceStatus } from '@shared/voice';

export type MicState = 'idle' | 'listening' | 'transcribing';

interface VoiceState {
  status: VoiceStatus;
  mic: MicState;
  /** Open mic: everything said goes to ARC (no wake word) until turned off. */
  openMic: boolean;
}

export const useVoiceStore = create<VoiceState>(() => ({
  status: { fishKey: false, stt: { state: 'idle', progress: null, model: 'base' } },
  mic: 'idle',
  openMic: false,
}));

export function bindVoice(): () => void {
  void window.arc.voice.status().then((status) => useVoiceStore.setState({ status }));
  return window.arc.voice.onStatus((status) => useVoiceStore.setState({ status }));
}
