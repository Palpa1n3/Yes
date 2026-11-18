/** Voice provider interfaces. Web Speech is the first implementation; Whisper /
 *  ElevenLabs-style providers implement the same shapes later. */

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

export interface SpeechInputProvider {
  id: string;
  /** False when the platform can't do it; the UI explains instead of failing silently. */
  available: boolean;
  unavailableReason?: string;
  start(handlers: {
    onText(text: string, final: boolean): void;
    onLevel?(level: number): void;
    onError?(msg: string): void;
  }): void;
  stop(): void;
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

/* ── Speech input: not available in Electron's Chromium without a Google API key ── */

export const unavailableSpeechInput: SpeechInputProvider = {
  id: 'none',
  available: false,
  unavailableReason:
    'Voice input needs a speech-to-text provider (e.g. a local Whisper model). It is planned for a later update.',
  start(h) {
    h.onError?.(this.unavailableReason ?? 'Unavailable');
  },
  stop() {
    /* nothing to stop */
  },
};
