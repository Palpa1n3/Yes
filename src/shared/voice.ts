/** Voice: speech-to-text with a local Whisper model (runs on this PC, free) and
 *  text-to-speech with Fish Audio (the user's chosen voice) or the Windows voices. */

export type VoiceEngine = 'system' | 'fish';
export const FISH_MODELS = ['s2.1-pro-free', 's2.1-pro'] as const;
export type FishModel = (typeof FISH_MODELS)[number];
/** The voice the user picked from the Fish Audio library. */
export const DEFAULT_FISH_VOICE = '06cfdb3653a4496983d6ad77f98cc184';

export const WHISPER_MODELS = {
  base: { id: 'Xenova/whisper-base.en', label: 'Standard', size: '≈ 75 MB' },
  small: { id: 'Xenova/whisper-small.en', label: 'Better', size: '≈ 250 MB' },
  // Best with accents; slower (a second or two per sentence on most PCs).
  medium: { id: 'Xenova/whisper-medium.en', label: 'Best (accents)', size: '≈ 800 MB' },
} as const;
export type WhisperModel = keyof typeof WHISPER_MODELS;

export const SAMPLE_RATE = 16_000;
/** Whisper hears up to 30 s at a time. */
export const MAX_RECORD_S = 30;

export interface SttStatus {
  state: 'idle' | 'downloading' | 'loading' | 'ready' | 'error';
  /** 0–100 while downloading. */
  progress: number | null;
  model: WhisperModel;
  error?: string;
}

export interface VoiceStatus {
  fishKey: boolean;
  stt: SttStatus;
}

export interface FishKeyResult {
  ok: boolean;
  message: string;
}

/** Plain speech text: no markdown, links or emoji. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'the link')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/[*_#>~|]+/g, '')
    .replace(/\p{Extended_Pictographic}️?/gu, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/([.!?])\.+/g, '$1')
    .trim();
}

/** Sentence-sized pieces so the first audio arrives quickly; later ones are fetched
 *  while earlier ones play. The first piece is kept short on purpose. */
export function splitForSpeech(text: string, max = 240): string[] {
  const sentences = text.match(/[^.!?]+(?:[.!?]+["”’)]?|$)\s*/g) ?? [text];
  const out: string[] = [];
  let cur = '';
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    const limit = out.length === 0 ? Math.min(max, 120) : max;
    if (cur && (cur + ' ' + s).length > limit) {
      out.push(cur);
      cur = s;
    } else cur = cur ? `${cur} ${s}` : s;
    // A single very long sentence is split at commas, then hard-wrapped.
    while (cur.length > max) {
      const cut = Math.max(cur.lastIndexOf(', ', max), cur.lastIndexOf(' ', max));
      const at = cut > max / 3 ? cut + 1 : max;
      out.push(cur.slice(0, at).trim());
      cur = cur.slice(at).trim();
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Whisper's placeholders for non-speech ("[BLANK_AUDIO]", "(music)") are not words. */
export function cleanTranscript(text: string): string {
  return text
    .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
