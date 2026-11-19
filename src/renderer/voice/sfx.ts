/** Sound effects synthesised with Web Audio: no audio files to ship or license.
 *  Each cue is a short, soft envelope so it stays unobtrusive. */
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { gamingQuiet } from '@renderer/stores/gamingStore';

export type Sfx = 'send' | 'success' | 'error' | 'boot' | 'open';

let ctx: AudioContext | null = null;
const audio = (): AudioContext | null => {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
};

function tone(
  ac: AudioContext,
  out: GainNode,
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType = 'sine',
  peak = 1,
  endFreq?: number,
): void {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(out);
  o.start(start);
  o.stop(start + dur + 0.02);
}

/** Play a cue unless sound effects are off. `force` ignores the setting (Settings "Test"). */
export function playSfx(name: Sfx, force = false): void {
  const { sfx, sfxVolume, whisper } = useSettingsStore.getState().settings;
  if ((!sfx && !force) || (whisper && !force) || sfxVolume <= 0 || (!force && gamingQuiet()))
    return;
  const ac = audio();
  if (!ac) return;
  const out = ac.createGain();
  out.gain.value = 0.18 * sfxVolume;
  out.connect(ac.destination);
  const t = ac.currentTime + 0.01;
  switch (name) {
    case 'send':
      tone(ac, out, 880, t, 0.07, 'sine', 0.8, 1320);
      break;
    case 'open':
      tone(ac, out, 660, t, 0.06, 'triangle', 0.6);
      break;
    case 'success':
      tone(ac, out, 784, t, 0.16, 'sine', 0.7);
      tone(ac, out, 1175, t + 0.08, 0.22, 'sine', 0.6);
      break;
    case 'error':
      tone(ac, out, 196, t, 0.28, 'triangle', 0.9, 147);
      break;
    case 'boot':
      tone(ac, out, 110, t, 1.2, 'sine', 0.5, 220);
      tone(ac, out, 330, t + 0.5, 0.8, 'sine', 0.25, 440);
      break;
  }
}
