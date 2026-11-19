import { describe, expect, it } from 'vitest';
import {
  addFix,
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
