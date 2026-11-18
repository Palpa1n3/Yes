/** Timer alarm: a bright two-tone chime repeating every ~1.4 s while any timer is ringing,
 *  for at most two minutes. Separate from the quiet SFX (own toggle and volume). */
import { useSettingsStore } from '@renderer/stores/settingsStore';

const MAX_RING_MS = 2 * 60_000;
let ctx: AudioContext | null = null;
let loop: ReturnType<typeof setInterval> | undefined;
let stopAt = 0;

function chime(ac: AudioContext, volume: number): void {
  const out = ac.createGain();
  out.gain.value = 0.35 * volume;
  out.connect(ac.destination);
  const t0 = ac.currentTime + 0.01;
  // Three rising notes, twice: noticeable without being harsh.
  [0, 0.55].forEach((offset) =>
    [880, 1175, 1568].forEach((f, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      const start = t0 + offset + i * 0.12;
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, start);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(1, start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
      o.connect(g).connect(out);
      o.start(start);
      o.stop(start + 0.3);
    }),
  );
}

export function playChime(force = false): void {
  const { alarmSound, alarmVolume } = useSettingsStore.getState().settings;
  if ((!alarmSound && !force) || alarmVolume <= 0) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    chime(ctx, alarmVolume);
  } catch {
    /* no audio device */
  }
}

/** Start ringing (no-op if already ringing). */
export function startAlarm(): void {
  stopAt = Date.now() + MAX_RING_MS;
  if (loop) return;
  playChime();
  loop = setInterval(() => {
    if (Date.now() > stopAt) return stopAlarm();
    playChime();
  }, 1400);
}

export function stopAlarm(): void {
  clearInterval(loop);
  loop = undefined;
}

export const alarmActive = (): boolean => loop !== undefined;
