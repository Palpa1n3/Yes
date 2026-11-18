import { describe, expect, it } from 'vitest';
import { fmtBytes, fmtCountdown, fmtUptime, loadTone } from '@renderer/lib/format';
import { dayPart } from '@renderer/hooks/useGreeting';

describe('format', () => {
  it('formats bytes with sensible precision', () => {
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(1536)).toBe('1.5 KB');
    expect(fmtBytes(781 * 1024 ** 3)).toBe('781 GB');
  });
  it('formats uptime and countdowns', () => {
    expect(fmtUptime(3 * 86400 + 4 * 3600)).toBe('3D 4H');
    expect(fmtUptime(3600 + 5 * 60)).toBe('1H 05M');
    expect(fmtCountdown((42 * 60 + 9) * 1000)).toBe('T-00:42:09');
  });
  it('picks threshold tones', () => {
    expect(loadTone(40)).toBe('accent');
    expect(loadTone(80)).toBe('amber');
    expect(loadTone(95)).toBe('alert');
  });
  it('buckets the day for greetings (late night is 00:00–05:00)', () => {
    expect(dayPart(2)).toBe('lateNight');
    expect(dayPart(9)).toBe('morning');
    expect(dayPart(14)).toBe('afternoon');
    expect(dayPart(20)).toBe('evening');
  });
});
