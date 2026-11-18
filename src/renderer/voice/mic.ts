import { MAX_RECORD_S, SAMPLE_RATE } from '@shared/voice';

export type StopReason = 'silence' | 'max' | 'nothing';

export interface MicSession {
  /** Stop and return the recording (16 kHz mono). */
  stop(): Float32Array;
  /** Stop and throw the recording away. */
  cancel(): void;
  /** Whether any speech was heard. */
  heardSpeech(): boolean;
}

/** Decides when the user has finished talking, from per-frame loudness (RMS). */
export class SilenceDetector {
  private floor = 0;
  private frames = 0;
  private speechAt: number | null = null;
  private lastLoud = 0;
  constructor(
    private readonly o = { silenceMs: 1200, nothingMs: 7000, maxMs: MAX_RECORD_S * 1000 },
  ) {}

  /** Feed one frame; returns a reason to stop, or null to keep listening. */
  push(rms: number, t: number): StopReason | null {
    // The first ~300 ms set the background noise level.
    if (this.frames++ < 5) this.floor = Math.max(this.floor, rms);
    const loud = rms > Math.max(0.012, this.floor * 2.5);
    if (loud) {
      this.lastLoud = t;
      this.speechAt ??= t;
    }
    if (t >= this.o.maxMs) return 'max';
    if (this.speechAt === null) return t >= this.o.nothingMs ? 'nothing' : null;
    return t - this.lastLoud >= this.o.silenceMs ? 'silence' : null;
  }

  get heard(): boolean {
    return this.speechAt !== null;
  }
}

export function rms(buf: Float32Array): number {
  let s = 0;
  for (const v of buf) s += v * v;
  return Math.sqrt(s / Math.max(1, buf.length));
}

/** Record from the default microphone until stopped or the user goes quiet. */
export async function startMic(opts: {
  onLevel(level: number): void;
  onAutoStop(reason: StopReason): void;
}): Promise<MicSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  const src = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is old but needs no extra module file (keeps the strict CSP simple).
  const proc = ctx.createScriptProcessor(1024, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  const chunks: Float32Array[] = [];
  const detector = new SilenceDetector();
  const started = performance.now();
  let stopped = false;

  proc.onaudioprocess = (e) => {
    if (stopped) return;
    const data = new Float32Array(e.inputBuffer.getChannelData(0));
    chunks.push(data);
    const level = rms(data);
    opts.onLevel(Math.min(1, level * 8));
    const reason = detector.push(level, performance.now() - started);
    if (reason) opts.onAutoStop(reason);
  };
  src.connect(proc);
  proc.connect(mute);
  mute.connect(ctx.destination);

  const close = (): void => {
    stopped = true;
    proc.onaudioprocess = null;
    for (const t of stream.getTracks()) t.stop();
    void ctx.close().catch(() => undefined);
    opts.onLevel(0);
  };
  return {
    stop() {
      close();
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const out = new Float32Array(Math.min(total, SAMPLE_RATE * MAX_RECORD_S));
      let at = 0;
      for (const c of chunks) {
        if (at >= out.length) break;
        out.set(c.subarray(0, out.length - at), at);
        at += c.length;
      }
      return out;
    },
    cancel: close,
    heardSpeech: () => detector.heard,
  };
}
