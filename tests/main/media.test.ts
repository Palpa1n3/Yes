import { describe, expect, it, vi } from 'vitest';
import { appLabel, parseNowPlaying } from '@shared/media';
import type { ProviderChunk } from '@shared/types';
import { MockProvider } from '../../src/main/services/ai-provider';
import { MediaWatcher } from '../../src/main/services/media-watch';

describe('now playing', () => {
  it('reads the watcher output', () => {
    expect(
      parseNowPlaying(
        '{"app":"Spotify.exe","title":"Bohemian Rhapsody","artist":"Queen","album":"A Night at the Opera","status":"Playing"}',
      ),
    ).toEqual({
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      album: 'A Night at the Opera',
      app: 'Spotify',
      playing: true,
    });
    expect(parseNowPlaying('{}')).toBeNull();
    expect(parseNowPlaying('not json')).toBeNull();
    expect(
      parseNowPlaying('{"app":"Chrome","title":"Lo-fi beats","status":"Paused"}'),
    ).toMatchObject({ app: 'Chrome', playing: false });
  });

  it('names apps', () => {
    expect(appLabel('SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify')).toBe('Spotify');
    expect(appLabel('MSEdge')).toBe('Edge');
    expect(appLabel('Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic')).toBe('Media Player');
    expect(appLabel('foobar2000.exe')).toBe('foobar2000');
  });

  it('reports changes once, across split output', () => {
    const onChange = vi.fn();
    const w = new MediaWatcher(onChange);
    w.feed('{"app":"Spotify","title":"A","status":"Playing"}\n{"app":"Spo');
    w.feed('tify","title":"A","status":"Playing"}\n');
    expect(onChange).toHaveBeenCalledTimes(1);
    w.feed('{}\n');
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(w.get()).toBeNull();
  });

  it('the offline brain says what is playing', async () => {
    const ask = async (n: ReturnType<typeof parseNowPlaying>): Promise<string> => {
      const out: ProviderChunk[] = [];
      for await (const c of new MockProvider(
        undefined,
        undefined,
        undefined,
        undefined,
        null,
        () => n,
      ).send([{ role: 'user', content: "what's this song?" }], { systemPrompt: '' }))
        out.push(c);
      return out.map((c) => (c.type === 'text' ? c.delta : '')).join('');
    };
    expect(
      await ask(
        parseNowPlaying('{"app":"Spotify","title":"Africa","artist":"Toto","status":"Playing"}'),
      ),
    ).toBe('Africa by Toto, in Spotify.');
    expect(await ask(null)).toMatch(/Nothing's playing/);
  });
});
