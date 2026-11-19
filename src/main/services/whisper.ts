/** Local speech-to-text with Whisper (Transformers.js + onnxruntime on the CPU). The
 *  model downloads once from Hugging Face into userData/models; audio never leaves the PC. */
import {
  MAX_RECORD_S,
  SAMPLE_RATE,
  WHISPER_MODELS,
  cleanTranscript,
  type SttStatus,
  type WhisperModel,
} from '@shared/voice';

export type Transcriber = (
  audio: Float32Array,
  /** Vocabulary hint (names to spell like this); '' for none. */
  prompt?: string,
) => Promise<{ text: string } | Array<{ text: string }>>;

export interface WhisperDeps {
  /** Build a transcriber for a Hugging Face model id, reporting download progress (0–100). */
  load(modelId: string, onProgress: (pct: number) => void): Promise<Transcriber>;
  model(): WhisperModel;
  onStatus(s: SttStatus): void;
  /** Words and names to prime the model with. */
  prompt?(): string;
  /** Fix the text afterwards (learnt mishearings, app names). */
  correct?(text: string): string;
}

export class WhisperService {
  private status: SttStatus;
  private loaded: { model: WhisperModel; run: Transcriber } | null = null;
  private loading: Promise<Transcriber> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly d: WhisperDeps) {
    this.status = { state: 'idle', progress: null, model: d.model() };
  }

  getStatus(): SttStatus {
    const model = this.d.model();
    if (this.loaded && this.loaded.model !== model) return { state: 'idle', progress: null, model };
    return { ...this.status, model };
  }

  private set(s: Omit<SttStatus, 'model'>, model: WhisperModel): void {
    this.status = { ...s, model };
    this.d.onStatus(this.getStatus());
  }

  /** Download (first time) and load the chosen model. Safe to call repeatedly. */
  prepare(): Promise<Transcriber> {
    const model = this.d.model();
    if (this.loaded?.model === model) return Promise.resolve(this.loaded.run);
    if (this.loading) return this.loading;
    this.set({ state: 'loading', progress: null }, model);
    let lastPct = -1;
    this.loading = this.d
      .load(WHISPER_MODELS[model].id, (pct) => {
        const p = Math.max(0, Math.min(100, Math.round(pct)));
        if (p === lastPct) return;
        lastPct = p;
        this.set({ state: p >= 100 ? 'loading' : 'downloading', progress: p }, model);
      })
      .then((run) => {
        this.loaded = { model, run };
        this.set({ state: 'ready', progress: null }, model);
        return run;
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.set(
          {
            state: 'error',
            progress: null,
            error: /fetch|network|ENOTFOUND|ECONN|EAI_AGAIN|Unauthorized|404/i.test(msg)
              ? "Couldn't download the speech model. Check your internet connection and try again."
              : `The speech model failed to load: ${msg.slice(0, 160)}`,
          },
          model,
        );
        throw err;
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }

  /** Text for 16 kHz mono audio. One transcription at a time. */
  transcribe(samples: Float32Array, raw = false): Promise<string> {
    const audio =
      samples.length > SAMPLE_RATE * MAX_RECORD_S
        ? samples.slice(0, SAMPLE_RATE * MAX_RECORD_S)
        : samples;
    const job = this.queue.then(async () => {
      if (audio.length < SAMPLE_RATE * 0.3) return '';
      const run = await this.prepare();
      const out = await run(audio, raw ? '' : (this.d.prompt?.() ?? ''));
      const text = cleanTranscript(
        (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text) ?? '',
      );
      return raw || !text ? text : (this.d.correct?.(text) ?? text);
    });
    this.queue = job.catch(() => undefined);
    return job;
  }
}

/** The real loader: Transformers.js on onnxruntime-node, cached under `cacheDir`. */
export function transformersLoader(cacheDir: string): WhisperDeps['load'] {
  return async (modelId, onProgress) => {
    const t = await import('@huggingface/transformers');
    t.env.cacheDir = cacheDir;
    t.env.allowLocalModels = false;
    // Overall progress across the model's files, by bytes.
    const files = new Map<string, { loaded: number; total: number }>();
    const asr = await t.pipeline('automatic-speech-recognition', modelId, {
      dtype: 'q8',
      device: 'cpu',
      progress_callback: (p: {
        status: string;
        file?: string;
        loaded?: number;
        total?: number;
      }) => {
        if (p.status !== 'progress' || !p.file || !p.total) return;
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
        let loaded = 0;
        let total = 0;
        for (const f of files.values()) {
          loaded += f.loaded;
          total += f.total;
        }
        if (total > 1_000_000) onProgress((loaded / total) * 100);
      },
    });
    return async (audio, prompt) => {
      if (prompt) {
        try {
          return { text: await promptedRun(asr, audio, prompt) };
        } catch {
          /* fall through to the plain way */
        }
      }
      return (await asr(audio, { chunk_length_s: 30 })) as
        { text: string } | Array<{ text: string }>;
    };
  };
}

/** Whisper with a "previous text" prompt: the vocabulary goes in before the audio is decoded,
 *  which makes the model spell those names and words the way they're written there. */
async function promptedRun(asr: unknown, audio: Float32Array, prompt: string): Promise<string> {
  type Tok = {
    encode(t: string, o?: { add_special_tokens?: boolean }): number[];
    decode(ids: number[], o?: { skip_special_tokens?: boolean }): string;
  };
  const p = asr as {
    processor(a: Float32Array): Promise<{ input_features: unknown }>;
    tokenizer: Tok;
    model: {
      generation_config: unknown;
      _retrieve_init_tokens(c: unknown): number[];
      generate(o: Record<string, unknown>): Promise<{ tolist(): Array<Array<number | bigint>> }>;
    };
  };
  const prev = p.tokenizer.encode('<|startofprev|>', { add_special_tokens: false });
  if (prev.length !== 1) throw new Error('No prompt token');
  const promptIds = p.tokenizer.encode(` ${prompt}`, { add_special_tokens: false }).slice(-180);
  const init = p.model._retrieve_init_tokens(p.model.generation_config);
  const start = [...prev, ...promptIds, ...init].map(Number);
  const { input_features } = await p.processor(audio);
  const out = await p.model.generate({
    inputs: input_features,
    decoder_input_ids: start,
    max_new_tokens: 160,
  });
  const seq = (out.tolist()[0] ?? []).map(Number).slice(start.length);
  return p.tokenizer.decode(seq, { skip_special_tokens: true }).trim();
}
