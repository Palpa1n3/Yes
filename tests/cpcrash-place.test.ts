import { describe, expect, it } from 'vitest';
import { parseCrashInfo, placesNear } from '@shared/cpcrash';

describe('crash position', () => {
  it('reads where V was from CrashInfo.json', () => {
    const c = parseCrashInfo(
      JSON.stringify({
        Data: {
          postMortem: {
            timeCrash: '2026-11-24T17:23:17Z',
            trackedQuest: { name: 'sq030_judy_romance' },
            location: { X: 599.98114, Y: -5325.063477, Z: 901.699341 },
            district: 'CityCenter',
            sessionLength: 53.3,
          },
        },
      }),
    );
    expect(c?.position).toEqual({ x: 599.98114, y: -5325.063477, z: 901.699341 });
  });

  it('finds a mod that sends V to that spot', () => {
    const pos = { x: 599.98, y: -5325.06, z: 901.7 };
    expect(placesNear('Drive.start = { x = 600, y = -5325, z = 901, yaw = -90 }', pos)).toBe(true);
    expect(placesNear('Teleport(p, Vector4.new(600.5, -5324, 902, 1))', pos)).toBe(true);
    expect(placesNear('let v = new Vector4(600, -5325, 901, 1.0);', pos)).toBe(true);
    expect(placesNear('Drive.platform = { x = 3000, y = -4500, z = 900 }', pos)).toBe(false);
    expect(placesNear('Vector4.new(0, 0, 901, 1)', { x: 0, y: 0, z: 901 })).toBe(false);
  });
});
