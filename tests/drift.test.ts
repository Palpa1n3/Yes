import { describe, expect, it } from 'vitest';
import { describeDrift, footprintDrift, type Footprint } from '@shared/drift';

const fp = (over: Partial<Footprint> = {}): Footprint => ({
  archives: 539,
  scripts: 120,
  tweaks: 60,
  plugins: 24,
  cet: 81,
  ...over,
});

describe('changes nobody asked for', () => {
  it('ignores the small day-to-day changes', () => {
    expect(footprintDrift(fp(), fp({ archives: 545, scripts: 118 }))).toEqual([]);
  });

  it('catches every mod disappearing at once', () => {
    const d = footprintDrift(fp(), fp({ archives: 2, cet: 30 }));
    expect(d).toEqual([
      { kind: 'archives', before: 539, after: 2 },
      { kind: 'cet', before: 81, after: 30 },
    ]);
    expect(describeDrift(d)).toMatch(/archive mods 539 → 2/);
    expect(describeDrift(d)).toMatch(/usual profile/);
  });

  it('catches a big jump too', () => {
    const d = footprintDrift(fp({ archives: 100 }), fp({ archives: 400 }));
    expect(d).toHaveLength(1);
    expect(describeDrift(d)).toMatch(/didn’t install/);
  });

  it('needs both a real number and a real share', () => {
    expect(footprintDrift(fp({ plugins: 4 }), fp({ plugins: 1 }))).toEqual([]);
  });
});
