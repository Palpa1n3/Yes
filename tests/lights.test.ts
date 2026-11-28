import { describe, expect, it } from 'vitest';
import { atBrightness, matchDevices, parseColor, toHex } from '@shared/lights';

const devices = [
  { index: 0, name: 'ASUS TUF GAMING B850-PLUS WIFI', type: 'Motherboard', leds: 2 },
  { index: 1, name: 'Kingston Fury DDR5', type: 'DRAM', leds: 12 },
  { index: 2, name: 'Razer DeathAdder V2 X', type: 'Mouse', leds: 1 },
];

describe('PC light colours and devices', () => {
  it('understands colour names, hex and rgb()', () => {
    expect(parseColor('Purple')).toEqual({ r: 128, g: 0, b: 255 });
    expect(parseColor('warm white')).toEqual({ r: 255, g: 180, b: 107 });
    expect(parseColor('#FF8800')).toEqual({ r: 255, g: 136, b: 0 });
    expect(parseColor('ff8800')).toEqual({ r: 255, g: 136, b: 0 });
    expect(parseColor('rgb(10, 20, 300)')).toEqual({ r: 10, g: 20, b: 255 });
    expect(parseColor('blue colour')).toEqual({ r: 0, g: 0, b: 255 });
    expect(parseColor('sparkly')).toBeNull();
    expect(toHex({ r: 255, g: 136, b: 0 })).toBe('#ff8800');
    expect(atBrightness({ r: 255, g: 136, b: 0 }, 50)).toEqual({ r: 128, g: 68, b: 0 });
  });

  it('picks devices by everyday names', () => {
    expect(matchDevices(devices, 'RAM').map((d) => d.index)).toEqual([1]);
    expect(matchDevices(devices, 'the motherboard lights').map((d) => d.index)).toEqual([0]);
    expect(matchDevices(devices, 'my mouse').map((d) => d.index)).toEqual([2]);
    expect(matchDevices(devices, 'razer').map((d) => d.index)).toEqual([2]);
    expect(matchDevices(devices, '')).toHaveLength(3);
    expect(matchDevices(devices, 'all')).toHaveLength(3);
    expect(matchDevices(devices, 'fridge')).toEqual([]);
  });
});
