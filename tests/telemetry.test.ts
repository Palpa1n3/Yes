import { describe, expect, it } from 'vitest';
import { createMockTelemetry } from '@renderer/mocks/telemetry';
import { useSystemStore } from '@renderer/stores/systemStore';

describe('mock telemetry', () => {
  it('produces in-range SystemStats', () => {
    const next = createMockTelemetry(8);
    for (let i = 0; i < 50; i++) {
      const s = next();
      expect(s.cpu.cores).toHaveLength(8);
      expect(s.cpu.load).toBeGreaterThanOrEqual(0);
      expect(s.cpu.load).toBeLessThanOrEqual(100);
      expect(s.memory.used).toBeLessThanOrEqual(s.memory.total);
      for (const d of s.disks) expect(d.used).toBeLessThanOrEqual(d.size);
    }
  });

  it('caps store history at 60 samples', () => {
    const next = createMockTelemetry(4);
    for (let i = 0; i < 80; i++) useSystemStore.getState().push(next(), 'mock');
    expect(useSystemStore.getState().history.cpu).toHaveLength(60);
  });
});
