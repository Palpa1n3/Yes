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
) => Promise<{ text: string } | Array<{ text: string }>>;

export interface WhisperDeps {
  /** Build a transcriber for a Hugging Face model id, reporting download progress (0–100). */
  load(modelId: string, onProgress: (pct: number) => void): Promise<Transcriber>;
  model(): WhisperModel;
  onStatus(s: SttStatus): void;
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
  transcribe(samples: Float32Array): Promise<string> {
    const audio =
      samples.length > SAMPLE_RATE * MAX_RECORD_S
        ? samples.slice(0, SAMPLE_RATE * MAX_RECORD_S)
        : samples;
    const job = this.queue.then(async () => {
      if (audio.length < SAMPLE_RATE * 0.3) return '';
      const run = await this.prepare();
      const out = await run(audio);
      const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text;
      return cleanTranscript(text ?? '');
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
    return async (audio) =>
      (await asr(audio, { chunk_length_s: 30 })) as { text: string } | Array<{ text: string }>;
  };
}
