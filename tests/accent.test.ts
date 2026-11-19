import { describe, expect, it } from 'vitest';
import { matchWake } from '@renderer/voice/wakeWord';
import { sanitizeSettings } from '@shared/settings';
import { WHISPER_MODELS } from '@shared/voice';

describe('accents', () => {
  it('hears "Alton" the way Welsh/UK accents often come out', () => {
    expect(matchWake('Olton, what time is it?', 'Alton')).toBe('what time is it?');
    expect(matchWake('Allton turn the volume down', 'Alton')).toBe('turn the volume down');
    expect(matchWake('Alton, hello', 'Alton')).toBe('hello');
    expect(matchWake('Walton is a town', 'Alton')).toBeNull();
  });
  it('has a best-for-accents speech model and keeps the accent setting', () => {
    expect(WHISPER_MODELS.medium.id).toBe('Xenova/whisper-medium.en');
    const s = sanitizeSettings({ whisperModel: 'medium', accent: 'Welsh' });
    expect(s.whisperModel).toBe('medium');
    expect(s.accent).toBe('Welsh');
    expect(sanitizeSettings({ whisperModel: 'huge' }).whisperModel).toBe('base');
  });
});
