/** Text-to-speech with Fish Audio (POST https://api.fish.audio/v1/tts). The API key
 *  stays in main; the renderer gets MP3 bytes back and plays them. */
import type { FishModel } from '@shared/voice';

export const FISH_TTS_URL = 'https://api.fish.audio/v1/tts';
export const MAX_TTS_CHARS = 1000;

type Fetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}>;

export interface FishDeps {
  fetch: Fetch;
  getKey(): Promise<string | null>;
  config(): { voiceId: string; model: FishModel };
}

export function fishRequest(
  key: string,
  text: string,
  voiceId: string,
  model: FishModel,
): { url: string; init: { method: string; headers: Record<string, string>; body: string } } {
  return {
    url: FISH_TTS_URL,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        model,
      },
      body: JSON.stringify({
        text: text.slice(0, MAX_TTS_CHARS),
        reference_id: voiceId,
        format: 'mp3',
        mp3_bitrate: 128,
        latency: 'balanced',
        normalize: true,
      }),
    },
  };
}

/** A plain-English reason for a failed request. */
export function fishError(status: number, body: string): string {
  const detail = body.replace(/\s+/g, ' ').trim().slice(0, 160);
  if (status === 401 || status === 403)
    return 'Fish Audio rejected the API key. Check it in Settings › Voice.';
  if (status === 402) return 'Your Fish Audio account is out of credit.';
  if (status === 404 || (status === 400 && /reference|model|voice/i.test(detail)))
    return 'Fish Audio could not find that voice. Check the voice ID in Settings › Voice.';
  if (status === 429) return 'Fish Audio is rate-limiting requests. Try again in a moment.';
  if (status >= 500) return 'Fish Audio is having problems right now.';
  return `Fish Audio returned an error (${status})${detail ? `: ${detail}` : ''}.`;
}

export class FishTts {
  constructor(private readonly d: FishDeps) {}

  /** MP3 bytes for the text, using a key passed in (for testing a new key) or the saved one. */
  async speak(text: string, keyOverride?: string, signal?: AbortSignal): Promise<Uint8Array> {
    const key = keyOverride ?? (await this.d.getKey());
    if (!key) throw new Error('Add your Fish Audio API key in Settings › Voice.');
    const t = text.trim();
    if (!t) return new Uint8Array();
    const { voiceId, model } = this.d.config();
    const { url, init } = fishRequest(key, t, voiceId, model);
    let res;
    try {
      res = await this.d.fetch(url, { ...init, signal });
    } catch (err) {
      throw new Error("Couldn't reach Fish Audio. Check your internet connection.", { cause: err });
    }
    if (!res.ok) throw new Error(fishError(res.status, await res.text().catch(() => '')));
    const audio = new Uint8Array(await res.arrayBuffer());
    if (audio.length < 100) throw new Error('Fish Audio sent back no audio.');
    return audio;
  }
}
