import { useSettingsStore } from '@renderer/stores/settingsStore';
import { cleanForSpeech, splitForSpeech } from '@shared/voice';

export interface FishHandlers {
  onLevel(level: number): void;
  /** Everything queued has finished (or was cancelled). */
  onIdle(): void;
  /** A clip failed; `rest` is the text that was not spoken. */
  onError(message: string, rest: string): void;
}

/** Plays replies in the Fish Audio voice: clips are fetched one sentence-group ahead
 *  of playback, so speech starts after the first short clip arrives. */
export class FishSpeaker {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private queue: string[] = [];
  private prefetch = new Map<string, Promise<AudioBuffer>>();
  private source: AudioBufferSourceNode | null = null;
  private gen = 0;
  private playing = false;
  private raf = 0;

  constructor(
    private readonly h: FishHandlers,
    private readonly fetchClip: (text: string) => Promise<Uint8Array> = (t) =>
      window.arc.voice.speak(t),
  ) {}

  get busy(): boolean {
    return this.playing || this.queue.length > 0;
  }

  speak(text: string): void {
    const parts = splitForSpeech(cleanForSpeech(text));
    if (!parts.length) return;
    this.queue.push(...parts);
    if (!this.playing) void this.next(this.gen);
  }

  cancel(): void {
    this.gen++;
    this.queue = [];
    this.prefetch.clear();
    try {
      this.source?.stop();
    } catch {
      /* already stopped */
    }
    this.source = null;
    this.stopMeter();
    if (this.playing) {
      this.playing = false;
      this.h.onIdle();
    }
  }

  private gain: GainNode | null = null;

  private audio(): { ctx: AudioContext; analyser: AnalyserNode } {
    if (!this.ctx || !this.analyser) {
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.gain = this.ctx.createGain();
      this.analyser.connect(this.gain);
      this.gain.connect(this.ctx.destination);
    }
    // Whisper mode plays Fish Audio quietly.
    if (this.gain) this.gain.gain.value = useSettingsStore.getState().settings.whisper ? 0.35 : 1;
    return { ctx: this.ctx, analyser: this.analyser };
  }

  private load(text: string): Promise<AudioBuffer> {
    let p = this.prefetch.get(text);
    if (!p) {
      p = this.fetchClip(text).then((bytes) =>
        // decodeAudioData takes ownership of the buffer, so hand it a copy.
        this.audio().ctx.decodeAudioData(bytes.slice().buffer),
      );
      p.catch(() => undefined);
      this.prefetch.set(text, p);
    }
    return p;
  }

  private async next(gen: number): Promise<void> {
    const text = this.queue.shift();
    if (text === undefined || gen !== this.gen) {
      if (gen === this.gen && this.playing) {
        this.playing = false;
        this.stopMeter();
        this.h.onIdle();
      }
      return;
    }
    this.playing = true;
    let buf: AudioBuffer;
    try {
      buf = await this.load(text);
    } catch (err) {
      if (gen !== this.gen) return;
      const rest = [text, ...this.queue].join(' ');
      this.queue = [];
      this.prefetch.clear();
      this.playing = false;
      this.stopMeter();
      this.h.onError(
        err instanceof Error
          ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
          : 'Speech failed.',
        rest,
      );
      return;
    }
    if (gen !== this.gen) return;
    this.prefetch.delete(text);
    const upcoming = this.queue[0];
    if (upcoming !== undefined) void this.load(upcoming).catch(() => undefined);
    const { ctx, analyser } = this.audio();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(analyser);
    src.onended = () => {
      if (this.source === src) this.source = null;
      void this.next(gen);
    };
    this.source = src;
    this.startMeter();
    src.start();
  }

  private startMeter(): void {
    if (this.raf || !this.analyser) return;
    const a = this.analyser;
    const data = new Uint8Array(a.fftSize);
    const tick = (): void => {
      a.getByteTimeDomainData(data);
      let s = 0;
      for (const v of data) s += ((v - 128) / 128) ** 2;
      this.h.onLevel(Math.min(1, Math.sqrt(s / data.length) * 4));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stopMeter(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.h.onLevel(0);
  }
}
