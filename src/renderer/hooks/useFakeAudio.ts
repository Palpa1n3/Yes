import { useEffect } from 'react';
import { useAssistantStore } from '@renderer/stores/assistantStore';

/** Speech-like amplitude from layered sines, so `listening` and `speaking` look alive
 *  before real audio exists. Replace with useSpeechInput/useSpeechOutput levels later. */
export function fakeLevel(t: number, state: 'listening' | 'speaking'): number {
  if (state === 'listening') {
    // Low, irregular room noise with the occasional bump.
    return Math.max(
      0,
      0.25 +
        0.15 * Math.sin(t * 3.1) +
        0.1 * Math.sin(t * 7.3) +
        0.25 * Math.max(0, Math.sin(t * 0.9)) ** 4,
    );
  }
  // Syllables (~5 Hz) under a phrase envelope (~0.5 Hz).
  const syllable = Math.abs(Math.sin(t * 15.7)) * 0.6 + Math.abs(Math.sin(t * 9.1)) * 0.4;
  const phrase = 0.55 + 0.45 * Math.sin(t * 2.9);
  return Math.min(1, syllable * phrase);
}

export function useFakeAudio(): void {
  const state = useAssistantStore((s) => s.state);
  const speechActive = useAssistantStore((s) => s.speechActive);
  useEffect(() => {
    const { setAudioLevel } = useAssistantStore.getState();
    if (speechActive) return; // real speech drives the level
    if (state !== 'listening' && state !== 'speaking') {
      setAudioLevel(0);
      return;
    }
    // ~30Hz is plenty; the core eases between samples.
    const id = setInterval(() => setAudioLevel(fakeLevel(performance.now() / 1000, state)), 33);
    return () => clearInterval(id);
  }, [state, speechActive]);
}
