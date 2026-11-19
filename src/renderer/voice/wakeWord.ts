import { SAMPLE_RATE } from '@shared/voice';
import { rms } from './mic';

const GREETING = '(?:(?:hey|hi|hello|ok|okay|yo)[\\s,]+)?';

/** Spellings Whisper may use for the assistant's name ("ARC" → arc, ark, a r c). */
export function nameVariants(name: string): string[] {
  const n = name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
  if (!n) return [];
  const out = new Set([n]);
  if (n.length <= 4 && !n.includes(' ')) out.add(n.split('').join(' '));
  if (n === 'arc') out.add('ark');
  // How "Alton" often comes out of speech recognition with Welsh and other UK accents.
  if (n === 'alton')
    for (const v of ['olton', 'allton', 'aulton', 'alltan', 'altan', 'olten', 'alten', "alton's"])
      out.add(v);
  return [...out];
}

/** Whisper's well-known "hallucinations" on silence, music or noise. */
const PHANTOMS = [
  /^thank(s| you)( so much| very much)?( for watching| for listening)?[.!]*$/i,
  /^(please )?(like and )?subscribe[.!]*$/i,
  /^you[.!]*$/i,
  /^bye[.!]*$/i,
  /^(\.|…|\s)*$/,
  /^(music|applause|silence|laughter|inaudible)$/i,
];
export const isPhantom = (text: string): boolean => PHANTOMS.some((re) => re.test(text.trim()));

/** Edit distance (insert/delete/substitute), small strings only. */
export function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j] ?? 0;
      row[j] = Math.min(
        (row[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return row[b.length] ?? 0;
}

/** For one-word names of 4+ letters: the first word (after an optional greeting) is
 *  close enough to the name. Returns the rest of the sentence, or null. */
function fuzzyName(t: string, name: string): string | null {
  const n = name.toLowerCase().replace(/[^a-z]/g, '');
  if (n.length < 4 || /\s/.test(name.trim())) return null;
  const words = t.split(' ');
  const start = /^(hey|hi|hello|ok|okay|yo)$/.test(words[0] ?? '') ? 1 : 0;
  const w = (words[start] ?? '').replace(/'s$/, '');
  const allowed = n.length >= 7 ? 2 : 1;
  // Shorter names: one swapped letter only (Elton/Alten for Alton, not Walton).
  const lengthOk = n.length >= 7 ? Math.abs(w.length - n.length) <= allowed : w.length === n.length;
  if (!w || !lengthOk || editDistance(w, n) > allowed) return null;
  return words.slice(start + 1).join(' ');
}

/** If the text starts with the wake phrase, what was said after it (maybe ''). */
export function matchWake(text: string, assistantName: string): string | null {
  const t = text
    .toLowerCase()
    .replace(/[.!?,;:"“”]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const names = nameVariants(assistantName)
    .map((v) => v.replace(/ /g, '\\s'))
    .join('|');
  if (!names) return null;
  const m = new RegExp(`^${GREETING}(?:${names})(?:'s)?\\b\\s*(.*)$`).exec(t);
  // Near misses for longer names ("Alton" heard as "Elton", "Alten", "Alton's").
  const fuzzy = m ? null : fuzzyName(t, assistantName);
  if (!m && fuzzy === null) return null;
  // Keep the original wording (capitals, punctuation) for the request itself.
  const rest = m ? (m[1] ?? '') : (fuzzy ?? '');
  if (!rest) return '';
  const at = text.toLowerCase().lastIndexOf(rest.split(' ')[0] ?? rest);
  return (at >= 0 ? text.slice(at) : rest).trim();
}

/** Cuts a continuous mic stream into utterances using loudness and a moving noise floor. */
export class UtteranceSegmenter {
  private floor = -1;
  private pre: Float32Array[] = [];
  private cur: Float32Array[] | null = null;
  private loudRun = 0;
  private quietRun = 0;
  private speechFrames = 0;

  constructor(
    private readonly o = {
      frameMs: 64,
      preRollFrames: 5,
      startFrames: 2,
      endQuietMs: 700,
      maxMs: 8000,
      minSpeechFrames: 4,
    },
  ) {}

  /** Feed one frame; returns a finished utterance, or null. */
  push(frame: Float32Array): Float32Array | null {
    const level = rms(frame);
    if (this.floor < 0) this.floor = level;
    const loud = level > Math.max(0.01, this.floor * 3);
    if (!loud && !this.cur) this.floor = this.floor * 0.95 + level * 0.05;

    if (!this.cur) {
      this.pre.push(frame);
      if (this.pre.length > this.o.preRollFrames) this.pre.shift();
      this.loudRun = loud ? this.loudRun + 1 : 0;
      if (this.loudRun >= this.o.startFrames) {
        this.cur = [...this.pre];
        this.pre = [];
        this.quietRun = 0;
        this.speechFrames = this.loudRun;
      }
      return null;
    }
    this.cur.push(frame);
    if (loud) {
      this.quietRun = 0;
      this.speechFrames++;
    } else this.quietRun++;
    const ms = this.cur.length * this.o.frameMs;
    if (this.quietRun * this.o.frameMs < this.o.endQuietMs && ms < this.o.maxMs) return null;
    const parts = this.cur;
    const enough = this.speechFrames >= this.o.minSpeechFrames;
    this.cur = null;
    this.loudRun = 0;
    if (!enough) return null; // a click or a bump
    const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }
}

/** Open the mic and report each utterance heard (16 kHz mono). */
export async function startWakeListener(
  onUtterance: (audio: Float32Array) => void,
): Promise<() => void> {
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
  const proc = ctx.createScriptProcessor(1024, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  const seg = new UtteranceSegmenter();
  proc.onaudioprocess = (e) => {
    const u = seg.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    if (u) onUtterance(u);
  };
  src.connect(proc);
  proc.connect(mute);
  mute.connect(ctx.destination);
  return () => {
    proc.onaudioprocess = null;
    for (const t of stream.getTracks()) t.stop();
    void ctx.close().catch(() => undefined);
  };
}
