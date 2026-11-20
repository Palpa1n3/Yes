import { describe, expect, it } from 'vitest';
import {
  PHONE_AVATARS,
  THEME_ACCENT,
  THEME_NAMES,
  isPhoneAvatar,
  phoneAvatarFor,
} from '@shared/looks';
import { replyMood } from '../src/renderer/components/core/avatarKit';

describe('phone look', () => {
  it('offers every PC avatar on the phone, plus none', () => {
    for (const a of [
      'rings',
      'face',
      'code',
      'sphere',
      'cloud',
      'wave',
      'swarm',
      'orb',
      'head',
    ] as const) {
      expect(isPhoneAvatar(a)).toBe(true);
      expect(phoneAvatarFor(a)).toBe(a);
    }
    expect(isPhoneAvatar('none')).toBe(true);
    expect(isPhoneAvatar('sparkles')).toBe(false);
    expect(PHONE_AVATARS).toHaveLength(10);
  });
  it('names every theme', () => {
    expect(Object.keys(THEME_NAMES).sort()).toEqual(Object.keys(THEME_ACCENT).sort());
  });
  it('reads the mood of a reply for the face', () => {
    expect(replyMood('Sorry, I couldn’t do that')).toBe('sorry');
    expect(replyMood('Done! Brilliant.')).toBe('excited');
    expect(replyMood('Which one do you mean?')).toBe('question');
    expect(replyMood('It is 4pm.')).toBe('neutral');
  });
});
