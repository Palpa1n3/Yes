/** The level of whatever the PC is playing (Spotify, YouTube…), for avatars that pulse to
 *  music. Captures the system sound ("loopback", set up in main) only while music is playing;
 *  it's analysed here and never recorded or sent anywhere. */

let audio: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let stream: MediaStream | null = null;
let buf: Float32Array<ArrayBuffer> | null = null;
let smooth = 0;
let starting: Promise<void> | null = null;

export function startMusicLevel(): Promise<void> {
  if (stream || starting) return starting ?? Promise.resolve();
  starting = (async () => {
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
      // Only the sound is wanted.
      for (const t of s.getVideoTracks()) t.stop();
      if (!s.getAudioTracks().length) return;
      stream = s;
      audio = new AudioContext();
      analyser = audio.createAnalyser();
      analyser.fftSize = 1024;
      audio.createMediaStreamSource(s).connect(analyser);
      buf = new Float32Array(analyser.fftSize);
    } catch {
      stopMusicLevel();
    } finally {
      starting = null;
    }
  })();
  return starting;
}

export function stopMusicLevel(): void {
  for (const t of stream?.getTracks() ?? []) t.stop();
  void audio?.close().catch(() => undefined);
  stream = null;
  audio = null;
  analyser = null;
  buf = null;
  smooth = 0;
}

/** 0–1, smoothed (fast attack, slow release) so pulses follow the beat. */
export function readMusicLevel(): number {
  if (!analyser || !buf) return 0;
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (const v of buf) sum += v * v;
  const rms = Math.sqrt(sum / buf.length);
  const target = Math.min(1, rms * 4.5);
  smooth = target > smooth ? smooth + (target - smooth) * 0.6 : smooth + (target - smooth) * 0.08;
  return smooth;
}
