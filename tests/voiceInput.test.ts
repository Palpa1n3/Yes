import { describe, expect, it } from 'vitest';
import { SilenceDetector, rms } from '@renderer/voice/mic';

describe('SilenceDetector', () => {
  const frame = 64; // ms per frame
  const feed = (d: SilenceDetector, levels: number[], start = 0): (string | null)[] =>
    levels.map((l, i) => d.push(l, start + i * frame));

  it('stops after a pause once speech was heard', () => {
    const d = new SilenceDetector();
    const quiet = Array(5).fill(0.002);
    const speech = Array(20).fill(0.08);
    const pause = Array(25).fill(0.003);
    const out = feed(d, [...quiet, ...speech, ...pause]);
    expect(d.heard).toBe(true);
    const at = out.findIndex(Boolean);
    expect(out[at]).toBe('silence');
    expect((at - 25) * frame).toBeGreaterThanOrEqual(1200 - frame);
  });

  it('gives up when nobody speaks, and stops at 30 s', () => {
    const d = new SilenceDetector();
    expect(feed(d, Array(120).fill(0.003)).find(Boolean)).toBe('nothing');
    expect(d.heard).toBe(false);
    const talker = new SilenceDetector();
    for (let i = 0; i < 5; i++) expect(talker.push(0.002, i * frame)).toBeNull();
    expect(talker.push(0.1, 29_000)).toBeNull();
    expect(talker.push(0.1, 30_000)).toBe('max');
  });

  it('adapts to a noisy room', () => {
    const d = new SilenceDetector();
    feed(d, Array(5).fill(0.03)); // fan noise
    expect(feed(d, Array(10).fill(0.035), 5 * frame).some(Boolean)).toBe(false);
    expect(d.heard).toBe(false);
    d.push(0.2, 15 * frame);
    expect(d.heard).toBe(true);
  });

  it('measures loudness', () => {
    expect(rms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5);
    expect(rms(new Float32Array())).toBe(0);
  });
});
