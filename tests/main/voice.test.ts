import { describe, expect, it, vi } from 'vitest';
import { sanitizeSettings } from '@shared/settings';
import {
  DEFAULT_FISH_VOICE,
  cleanForSpeech,
  cleanTranscript,
  splitForSpeech,
  type SttStatus,
} from '@shared/voice';
import { FISH_TTS_URL, FishTts, fishError, fishRequest } from '../../src/main/services/fish-tts';
import { WhisperService, type Transcriber } from '../../src/main/services/whisper';

describe('speech text', () => {
  it('strips markdown, links and emoji for speaking', () => {
    expect(cleanForSpeech('**Done!** See https://example.com/x ⏰\n- one\n- two')).toBe(
      'Done! See the link. one. two',
    );
    expect(cleanForSpeech('Use `npm run dev` [here](http://a.b).')).toBe('Use npm run dev here.');
  });

  it('splits into a short first clip, then larger ones', () => {
    const text =
      'Good morning, sir. It is eight thirty. ' +
      'In Leeds it is eight degrees and raining, with a high of ten. '.repeat(4) +
      'Your PC looks healthy.';
    const parts = splitForSpeech(text);
    expect(parts[0]?.startsWith('Good morning, sir. It is eight thirty.')).toBe(true);
    expect(parts[0]?.length).toBeLessThanOrEqual(120);
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts.every((p) => p.length <= 240)).toBe(true);
    expect(parts.join(' ')).toBe(text.replace(/\s+/g, ' ').trim());
    const long = 'word '.repeat(120).trim();
    expect(splitForSpeech(long).every((p) => p.length <= 240)).toBe(true);
    expect(splitForSpeech('')).toEqual([]);
  });

  it("drops Whisper's non-speech markers", () => {
    expect(cleanTranscript(' [BLANK_AUDIO] ')).toBe('');
    expect(cleanTranscript(' (music) Open Spotify. [noise]')).toBe('Open Spotify.');
  });

  it('sanitises voice settings', () => {
    const s = sanitizeSettings({
      voiceEngine: 'robot',
      fishVoiceId: 'bad id!',
      fishModel: 'x',
      whisperModel: 'huge',
    });
    expect(s).toMatchObject({
      voiceEngine: 'system',
      fishVoiceId: DEFAULT_FISH_VOICE,
      fishModel: 's2.1-pro-free',
      whisperModel: 'base',
      voiceInput: true,
    });
    expect(
      sanitizeSettings({
        voiceEngine: 'fish',
        fishVoiceId: 'abc123def456',
        fishModel: 's2.1-pro',
        whisperModel: 'small',
        voiceInput: false,
      }),
    ).toMatchObject({
      voiceEngine: 'fish',
      fishVoiceId: 'abc123def456',
      fishModel: 's2.1-pro',
      whisperModel: 'small',
      voiceInput: false,
    });
  });
});

describe('Fish Audio', () => {
  it('builds the documented request', () => {
    const { url, init } = fishRequest('KEY', 'Hello.', 'voice1', 's2.1-pro-free');
    expect(url).toBe(FISH_TTS_URL);
    expect(init.headers).toEqual({
      Authorization: 'Bearer KEY',
      'Content-Type': 'application/json',
      model: 's2.1-pro-free',
    });
    expect(JSON.parse(init.body)).toMatchObject({
      text: 'Hello.',
      reference_id: 'voice1',
      format: 'mp3',
    });
  });

  it('explains failures plainly', () => {
    expect(fishError(401, '')).toMatch(/rejected the API key/);
    expect(fishError(402, '')).toMatch(/out of credit/);
    expect(fishError(400, 'reference_id not found')).toMatch(/could not find that voice/);
    expect(fishError(503, '')).toMatch(/having problems/);
    expect(fishError(418, 'teapot')).toBe('Fish Audio returned an error (418): teapot.');
  });

  function fish(
    res: { ok: boolean; status: number; bytes?: number; body?: string } | Error,
    key: string | null = 'k'.repeat(32),
  ) {
    const fetch = vi.fn(async () => {
      if (res instanceof Error) throw res;
      return {
        ok: res.ok,
        status: res.status,
        arrayBuffer: async () => new ArrayBuffer(res.bytes ?? 0),
        text: async () => res.body ?? '',
      };
    });
    return {
      tts: new FishTts({
        fetch,
        getKey: async () => key,
        config: () => ({ voiceId: 'v', model: 's2.1-pro-free' }),
      }),
      fetch,
    };
  }

  it('returns audio bytes, or a clear error', async () => {
    expect((await fish({ ok: true, status: 200, bytes: 4000 }).tts.speak('Hi')).length).toBe(4000);
    await expect(fish({ ok: true, status: 200 }, null).tts.speak('Hi')).rejects.toThrow(
      /Add your Fish Audio API key/,
    );
    await expect(fish({ ok: false, status: 401 }).tts.speak('Hi')).rejects.toThrow(
      /rejected the API key/,
    );
    await expect(fish(new Error('ENOTFOUND')).tts.speak('Hi')).rejects.toThrow(
      /Couldn't reach Fish Audio/,
    );
    await expect(fish({ ok: true, status: 200, bytes: 10 }).tts.speak('Hi')).rejects.toThrow(
      /no audio/,
    );
    const { tts, fetch } = fish({ ok: true, status: 200, bytes: 4000 });
    expect((await tts.speak('   ')).length).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('tests a new key without needing a saved one', async () => {
    const { tts, fetch } = fish({ ok: true, status: 200, bytes: 4000 }, null);
    await tts.speak('Hello.', 'NEWKEY');
    expect((fetch.mock.calls[0] as unknown[])[1]).toMatchObject({
      headers: { Authorization: 'Bearer NEWKEY' },
    });
  });
});

describe('WhisperService', () => {
  function service(opts: { fail?: Error } = {}) {
    let model: 'base' | 'small' = 'base';
    const statuses: SttStatus[] = [];
    const run = vi.fn<Transcriber>(async () => ({ text: ' Open Spotify. [BLANK_AUDIO]' }));
    const load = vi.fn(async (_id: string, onProgress: (p: number) => void) => {
      onProgress(10);
      onProgress(10.2);
      onProgress(100);
      if (opts.fail) throw opts.fail;
      return run;
    });
    const svc = new WhisperService({ load, model: () => model, onStatus: (s) => statuses.push(s) });
    return { svc, load, run, statuses, setModel: (m: 'base' | 'small') => (model = m) };
  }
  const second = new Float32Array(16_000);

  it('downloads once, reports progress, and transcribes', async () => {
    const { svc, load, statuses } = service();
    expect(svc.getStatus()).toEqual({ state: 'idle', progress: null, model: 'base' });
    expect(await svc.transcribe(second)).toBe('Open Spotify.');
    await svc.transcribe(second);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0]?.[0]).toBe('Xenova/whisper-base.en');
    expect(statuses.map((s) => `${s.state}${s.progress ?? ''}`)).toEqual([
      'loading',
      'downloading10',
      'loading100',
      'ready',
    ]);
  });

  it('ignores clicks too short to hold a word', async () => {
    const { svc, load } = service();
    expect(await svc.transcribe(new Float32Array(1000))).toBe('');
    expect(load).not.toHaveBeenCalled();
  });

  it('caps audio at 30 seconds', async () => {
    const { svc, run } = service();
    await svc.transcribe(new Float32Array(16_000 * 45));
    expect(run.mock.calls[0]?.[0].length).toBe(16_000 * 30);
  });

  it('reloads after the model setting changes', async () => {
    const { svc, load, setModel } = service();
    await svc.prepare();
    setModel('small');
    expect(svc.getStatus().state).toBe('idle');
    await svc.prepare();
    expect(load.mock.calls[1]?.[0]).toBe('Xenova/whisper-small.en');
  });

  it('turns download failures into a helpful message and can retry', async () => {
    const { svc } = service({ fail: new TypeError('fetch failed') });
    await expect(svc.transcribe(second)).rejects.toThrow(/fetch failed/);
    expect(svc.getStatus()).toMatchObject({
      state: 'error',
      error: expect.stringMatching(/internet connection/),
    });
    await expect(svc.prepare()).rejects.toThrow(); // a new attempt, not a cached failure
  });
});
