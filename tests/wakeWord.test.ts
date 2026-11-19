import { describe, expect, it } from 'vitest';
import { sanitizeSettings } from '@shared/settings';
import {
  UtteranceSegmenter,
  editDistance,
  isPhantom,
  matchWake,
  nameVariants,
} from '@renderer/voice/wakeWord';

describe('matchWake', () => {
  it('spots the wake phrase and keeps the request', () => {
    expect(matchWake('Hey ARC, what time is it?', 'ARC')).toBe('what time is it?');
    expect(matchWake('Hey Ark. Open Spotify.', 'ARC')).toBe('Open Spotify.');
    expect(matchWake('Okay, arc, set a timer for 10 minutes', 'ARC')).toBe(
      'set a timer for 10 minutes',
    );
    expect(matchWake('Hey A R C turn the volume down', 'ARC')).toBe('turn the volume down');
    expect(matchWake('Hey Arc.', 'ARC')).toBe('');
    expect(matchWake('Arc', 'ARC')).toBe('');
  });

  it('ignores ordinary speech', () => {
    expect(matchWake('I went to the arcade yesterday', 'ARC')).toBeNull();
    expect(matchWake('Noah built an ark', 'ARC')).toBeNull();
    expect(matchWake('Hey Archie', 'ARC')).toBeNull();
    expect(matchWake('', 'ARC')).toBeNull();
  });

  it('follows a renamed assistant', () => {
    expect(matchWake('Hey Jarvis, lock the PC', 'JARVIS')).toBe('lock the PC');
    expect(matchWake('Hey ARC, lock the PC', 'JARVIS')).toBeNull();
    expect(nameVariants('ARC')).toEqual(['arc', 'a r c', 'ark']);
    expect(nameVariants('Friday')).toEqual(['friday']);
  });
});

describe('UtteranceSegmenter', () => {
  const frame = (level: number): Float32Array => new Float32Array(1024).fill(level);
  const run = (seg: UtteranceSegmenter, levels: number[]): Float32Array[] =>
    levels.map((l) => seg.push(frame(l))).filter((x): x is Float32Array => x !== null);

  it('returns one utterance per phrase, with a little lead-in', () => {
    const seg = new UtteranceSegmenter();
    const out = run(seg, [
      ...Array(10).fill(0.002),
      ...Array(20).fill(0.1), // ~1.3 s of speech
      ...Array(15).fill(0.002),
      ...Array(10).fill(0.002),
      ...Array(12).fill(0.1),
      ...Array(15).fill(0.002),
    ]);
    expect(out).toHaveLength(2);
    // pre-roll (up to 5 frames) + speech + the trailing pause that ended it
    expect(out[0]!.length / 1024).toBeGreaterThanOrEqual(20 + 11);
  });

  it('ignores clicks and caps long speech at 8 seconds', () => {
    const seg = new UtteranceSegmenter();
    expect(run(seg, [...Array(10).fill(0.002), 0.2, 0.2, ...Array(15).fill(0.002)])).toHaveLength(
      0,
    );
    const long = run(new UtteranceSegmenter(), [...Array(5).fill(0.002), ...Array(200).fill(0.1)]);
    expect(long.length).toBeGreaterThanOrEqual(1);
    expect(long[0]!.length / 1024).toBeLessThanOrEqual(126);
  });

  it('adapts to steady background noise', () => {
    const seg = new UtteranceSegmenter();
    expect(run(seg, Array(60).fill(0.03))).toHaveLength(0);
  });
});

describe('voice hotkey setting', () => {
  it('defaults to Ctrl+Alt+Space and can be turned off', () => {
    expect(sanitizeSettings({}).voiceHotkey).toBe('CommandOrControl+Alt+Space');
    expect(sanitizeSettings({ voiceHotkey: '' }).voiceHotkey).toBe('');
    expect(sanitizeSettings({ voiceHotkey: 'F9' }).voiceHotkey).toBe('F9');
  });
});

describe('wake word without "hey", and open mic', () => {
  it('accepts just the name, with or without a greeting', () => {
    expect(matchWake('Alton, what time is it?', 'Alton')).toBe('what time is it?');
    expect(matchWake('Hey Alton open notes', 'Alton')).toBe('open notes');
    expect(matchWake('Alton.', 'Alton')).toBe('');
  });

  it('tolerates near-misses of longer names', () => {
    expect(matchWake('Elton, pause the music', 'Alton')).toBe('pause the music');
    expect(matchWake("Alton's here, what's up", 'Alton')).toBe("here, what's up");
    expect(matchWake('Alten what is the weather', 'Alton')).toBe('what is the weather');
    expect(matchWake('Walton Street is closed', 'Alton')).toBeNull();
    expect(matchWake('Also, the shop is shut', 'Alton')).toBeNull();
    expect(editDistance('elton', 'alton')).toBe(1);
  });

  it("ignores Whisper's phantom phrases", () => {
    for (const t of ['Thank you.', 'Thanks for watching!', 'you', '...', 'Subscribe!'])
      expect(isPhantom(t)).toBe(true);
    expect(isPhantom('Thank you for the help with my essay')).toBe(false);
  });
});
