import { create } from 'zustand';
import type { VoiceStatus } from '@shared/voice';

export type MicState = 'idle' | 'listening' | 'transcribing';

interface VoiceState {
  status: VoiceStatus;
  mic: MicState;
}

export const useVoiceStore = create<VoiceState>(() => ({
  status: { fishKey: false, stt: { state: 'idle', progress: null, model: 'base' } },
  mic: 'idle',
}));

export function bindVoice(): () => void {
  void window.arc.voice.status().then((status) => useVoiceStore.setState({ status }));
  return window.arc.voice.onStatus((status) => useVoiceStore.setState({ status }));
}
