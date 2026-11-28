import { describe, expect, it } from 'vitest';
import { changingFacts, checkFirstNote } from '@shared/confidence';

describe('knowing when an answer needs checking', () => {
  it('spots questions about facts that change', () => {
    expect(changingFacts('How much is a PS5 in Argos?')).toEqual(['prices and stock']);
    expect(changingFacts("What's the latest version of Vortex?")).toEqual([
      'the latest version or news',
    ]);
    expect(changingFacts('Is Tesco in Neath open now?')).toEqual(['opening times']);
    expect(changingFacts('Who won the Wales game?')).toEqual(['results and fixtures']);
    expect(changingFacts('When does GTA 6 come out?')).toEqual(['release dates']);
    expect(changingFacts('Are the trains to Cardiff delayed?')).toEqual(['travel']);
    expect(changingFacts('Is Discord down?')).toEqual(['whether a service is down']);
  });

  it('leaves alone what Alton can answer itself, and everyday chat', () => {
    expect(changingFacts("What's the weather like tomorrow?")).toEqual([]);
    expect(changingFacts('When is my next shift?')).toEqual([]);
    expect(changingFacts('Tell me a joke')).toEqual([]);
    expect(checkFirstNote('set a timer for 5 minutes')).toBe('');
  });

  it('writes a note asking for a check and a source', () => {
    expect(checkFirstNote('How much is a Steam Deck?')).toMatch(
      /web search.*where the answer came from/,
    );
  });
});
