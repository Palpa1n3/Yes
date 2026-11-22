import { describe, expect, it, vi } from 'vitest';

describe('At work map', () => {
  it('measures distances on the ground', async () => {
    const { metresBetween } = await import('../phone/src/workmap');
    // Cardiff Central to Cardiff Castle is roughly 1 km.
    const d = metresBetween({ lat: 51.4757, lon: -3.1791 }, { lat: 51.4822, lon: -3.1812 });
    expect(d).toBeGreaterThan(650);
    expect(d).toBeLessThan(800);
    expect(metresBetween({ lat: 51.5, lon: -3.2 }, { lat: 51.5, lon: -3.2 })).toBe(0);
  });
  it('draws tiles around the place and puts the pin there', async () => {
    const { mountWorkMap } = await import('../phone/src/workmap');
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
    const box = document.createElement('div');
    Object.defineProperty(box, 'clientWidth', { value: 360 });
    Object.defineProperty(box, 'clientHeight', { value: 240 });
    document.body.appendChild(box);
    const m = mountWorkMap(
      box,
      { lat: 51.48, lon: -3.18 },
      { pin: { lat: 51.48, lon: -3.18 }, radius: 150, onPin: () => undefined },
    );
    const imgs = box.querySelectorAll('img');
    expect(imgs.length).toBeGreaterThan(0);
    expect(imgs[0]?.getAttribute('src')).toMatch(
      /^https:\/\/tile\.openstreetmap\.org\/16\/\d+\/\d+\.png$/,
    );
    expect(m.pin()).toEqual({ lat: 51.48, lon: -3.18 });
    m.destroy();
    vi.unstubAllGlobals();
  });
});
