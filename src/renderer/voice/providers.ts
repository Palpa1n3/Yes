/** The Windows (Web Speech) voice. Fish Audio speech is in fishSpeech.ts and the
 *  microphone (local Whisper) in mic.ts / useSpeechInput.ts. */

export interface VoiceInfo {
  name: string;
  lang: string;
  local: boolean;
}

export interface SpeakOptions {
  voiceName?: string;
  /** Called at each word boundary (drives the core's speaking pulse). */
  onWord?(): void;
  onEnd?(): void;
}

export interface SpeechOutputProvider {
  id: string;
  available: boolean;
  voices(): Promise<VoiceInfo[]>;
  speak(text: string, opts?: SpeakOptions): void;
  cancel(): void;
}

/* ── Web Speech output (uses the OS voices, e.g. Windows' built-in narrator voices) ── */

export const webSpeechOutput: SpeechOutputProvider = {
  id: 'web-speech',
  available: typeof window !== 'undefined' && 'speechSynthesis' in window,
  voices() {
    if (!this.available) return Promise.resolve([]);
    const read = (): VoiceInfo[] =>
      speechSynthesis
        .getVoices()
        .map((v) => ({ name: v.name, lang: v.lang, local: v.localService }));
    const now = read();
    if (now.length) return Promise.resolve(now);
    // Voices load asynchronously the first time.
    return new Promise((resolve) => {
      const done = (): void => resolve(read());
      speechSynthesis.addEventListener('voiceschanged', done, { once: true });
      setTimeout(done, 1500);
    });
  },
  speak(text, opts = {}) {
    if (!this.available || !text.trim()) return opts.onEnd?.();
    const u = new SpeechSynthesisUtterance(text);
    const voice = speechSynthesis.getVoices().find((v) => v.name === opts.voiceName);
    if (voice) u.voice = voice;
    u.rate = 1.02;
    u.onboundary = (e) => e.name === 'word' && opts.onWord?.();
    u.onend = () => opts.onEnd?.();
    u.onerror = () => opts.onEnd?.();
    speechSynthesis.speak(u);
  },
  cancel() {
    if (this.available) speechSynthesis.cancel();
  },
};
