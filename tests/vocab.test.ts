import { describe, expect, it } from 'vitest';
import {
  addFix,
  pickHeard,
  applyFixes,
  cleanAppNames,
  fixAppCommand,
  learnFix,
  voicePrompt,
} from '@shared/vocab';
import { sanitizeSettings } from '@shared/settings';

describe('working around your voice', () => {
  it('learns what it misheard from a training phrase', () => {
    expect(learnFix('Open necklion.', 'Open Lunar Client')).toEqual({
      heard: 'necklion',
      meant: 'Lunar Client',
    });
    expect(learnFix('open next line', 'Open Lunar Client')).toEqual({
      heard: 'next line',
      meant: 'Lunar Client',
    });
    expect(learnFix('Set a timer for ten minutes.', 'Set a timer for ten minutes')).toBeNull();
  });

  it('fixes what you say from then on', () => {
    let fixes = addFix([], { heard: 'necklion', meant: 'Lunar Client' });
    fixes = addFix(fixes, { heard: 'next line', meant: 'Lunar Client' });
    expect(applyFixes('Open necklion.', fixes)).toBe('Open Lunar Client.');
    expect(applyFixes('open Next Line please', fixes)).toBe('open Lunar Client please');
    // Whole words only.
    expect(applyFixes('the next lines are fine', fixes)).toBe('the next lines are fine');
  });

  it('snaps "open X" to a close installed app name', () => {
    const apps = ['Lunar Client', 'Discord', 'Steam'];
    expect(fixAppCommand('Open lunar klient.', apps)).toBe('Open Lunar Client.');
    expect(fixAppCommand('Alton, open discort', apps)).toBe('Alton, open Discord');
    expect(fixAppCommand('open the fridge', apps)).toBe('open the fridge');
    expect(fixAppCommand('what is the weather', apps)).toBe('what is the weather');
  });

  it('builds a short vocabulary hint and keeps the settings', () => {
    const p = voicePrompt(
      'Alton',
      ['Tesco'],
      [{ heard: 'necklion', meant: 'Lunar Client' }],
      ['Discord', 'tesco'],
    );
    expect(p).toBe('Alton, Tesco, Lunar Client, Discord.');
    expect(cleanAppNames(['Uninstall Steam', 'Steam', 'Steam'])).toEqual(['Steam']);
    const s = sanitizeSettings({
      voiceWords: ['Tesco'],
      voiceFixes: [{ heard: 'x', meant: 'y' }, { bad: 1 }],
    });
    expect(s.voiceWords).toEqual(['Tesco']);
    expect(s.voiceFixes).toEqual([{ heard: 'x', meant: 'y' }]);
  });
});

describe("picking the best of the phone recogniser's guesses", () => {
  it("prefers a guess with the user's names and places", () => {
    const guesses = ["text will I'm at test go", "text Will I'm at Tesco", 'tex will im at tesco'];
    expect(pickHeard(guesses, ['Will', 'Tesco', 'Alton'], [])).toBe("text Will I'm at Tesco");
  });
  it('keeps the first guess when nothing matches, and avoids known mishearings', () => {
    expect(pickHeard(['what time is it', 'what time is a'], ['Alton'], [])).toBe('what time is it');
    const fixes = [{ heard: 'all ton', meant: 'Alton' }];
    expect(pickHeard(['all ton set an alarm', 'alton set an alarm'], [], fixes)).toBe(
      'alton set an alarm',
    );
    expect(pickHeard(['all ton set an alarm'], [], fixes)).toBe('Alton set an alarm');
  });
});
