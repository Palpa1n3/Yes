import { useSettingsStore } from '@renderer/stores/settingsStore';
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
    const whisper = useSettingsStore.getState().settings.whisper;
    u.rate = whisper ? 0.94 : 1.02;
    // A little expression: brighter when excited, softer when apologising.
    const mood = voiceMood(text);
    u.pitch = mood === 'excited' ? 1.08 : mood === 'sorry' ? 0.94 : mood === 'question' ? 1.03 : 1;
    if (mood === 'excited' && !whisper) u.rate = 1.06;
    if (mood === 'sorry') u.rate = Math.min(u.rate, 0.97);
    u.volume = whisper ? 0.35 : 1;
    u.onboundary = (e) => e.name === 'word' && opts.onWord?.();
    u.onend = () => opts.onEnd?.();
    u.onerror = () => opts.onEnd?.();
    speechSynthesis.speak(u);
  },
  cancel() {
    if (this.available) speechSynthesis.cancel();
  },
};

/** Rough tone of a reply, for pitch and pace (and the face). */
export function voiceMood(text: string): 'excited' | 'sorry' | 'question' | 'neutral' {
  const t = text.slice(0, 400);
  if (/\b(sorry|unfortunately|apologi[sz]e|my mistake|couldn['’]?t|failed)\b/i.test(t))
    return 'sorry';
  if (
    (t.match(/!/g) ?? []).length >= 1 ||
    /\b(great|brilliant|awesome|congrat|done!|nice)\b/i.test(t)
  )
    return 'excited';
  if (/\?\s*$/.test(t.trim())) return 'question';
  return 'neutral';
}
