import { describe, expect, it } from 'vitest';
import { movesLanded, volumeMismatch } from '@shared/verify';

describe('checking a change after making it', () => {
  it('spots a volume change Windows didn’t take', () => {
    expect(volumeMismatch({ level: 40 }, { level: 40, muted: false })).toBeNull();
    expect(volumeMismatch({ level: 40 }, { level: 41, muted: false })).toBeNull();
    expect(volumeMismatch({ level: 40 }, { level: 70, muted: false })).toMatch(/70%, not 40%/);
    expect(volumeMismatch({ mute: true }, { level: 40, muted: false })).toMatch(/not muted/);
    expect(volumeMismatch({ mute: false }, { level: 40, muted: true })).toMatch(/still muted/);
  });

  it('checks every moved file arrived', () => {
    const there = new Set(['D:/Docs/a.pdf', 'D:/Downloads/b.zip', 'D:/Archives/b.zip']);
    const r = movesLanded(
      [
        { from: 'D:/Downloads/a.pdf', to: 'D:/Docs/a.pdf' },
        { from: 'D:/Downloads/b.zip', to: 'D:/Archives/b.zip' },
        { from: 'D:/Downloads/c.exe', to: 'D:/Installers/c.exe' },
      ],
      (p) => there.has(p),
    );
    expect(r.landed.map((m) => m.to)).toEqual(['D:/Docs/a.pdf']);
    expect(r.missing.map((m) => m.from)).toEqual(['D:/Downloads/b.zip', 'D:/Downloads/c.exe']);
  });
});
