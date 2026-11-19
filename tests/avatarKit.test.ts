import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hexToChannels,
  moodNow,
  setMood,
  soundsConfused,
} from '@renderer/components/core/avatarKit';
import { sanitizeSettings } from '@shared/settings';

describe('avatar look and moods', () => {
  afterEach(() => vi.useRealTimers());
  it('reads colours and keeps the customise settings in range', () => {
    expect(hexToChannels('#3fd0ff')).toBe('63 208 255');
    expect(hexToChannels('nope')).toBe('');
    const s = sanitizeSettings({
      avatar: 'orb',
      avatarColor: '#FF8800',
      avatarSize: 5,
      avatarGlow: 9,
    });
    expect([s.avatar, s.avatarColor, s.avatarSize, s.avatarGlow, s.avatarMotion]).toEqual([
      'orb',
      '#FF8800',
      5,
      3,
      3,
    ]);
    expect(sanitizeSettings({ avatar: 'hologram' }).avatar).toBe('face');
  });
  it('looks pleased or confused for a few seconds', () => {
    vi.useFakeTimers();
    setMood('pleased');
    expect(moodNow().pleased).toBeCloseTo(1);
    vi.advanceTimersByTime(2000);
    expect(moodNow().pleased).toBeCloseTo(0.5);
    vi.advanceTimersByTime(3000);
    expect(moodNow()).toEqual({ pleased: 0, confused: 0 });
    setMood('confused');
    expect(moodNow().confused).toBeGreaterThan(0.9);
  });
  it('spots replies that did not understand', () => {
    expect(soundsConfused("I'm not sure what you mean by beat one out.")).toBe(true);
    expect(soundsConfused('Sorry, I didn’t catch that.'.replace('’', "'"))).toBe(true);
    expect(soundsConfused('Done: download mode is off.')).toBe(false);
  });
});
