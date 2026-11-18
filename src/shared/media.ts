/** What's playing (from Windows' media controls: Spotify, browsers, media apps…). */
export interface NowPlaying {
  title: string;
  artist: string;
  album: string;
  /** Friendly app name ("Spotify", "Chrome"). */
  app: string;
  playing: boolean;
}

const APPS: Array<[RegExp, string]> = [
  [/spotify/i, 'Spotify'],
  [/chrome/i, 'Chrome'],
  [/msedge|edge/i, 'Edge'],
  [/firefox/i, 'Firefox'],
  [/opera/i, 'Opera'],
  [/brave/i, 'Brave'],
  [/vlc/i, 'VLC'],
  [/zunemusic|mediaplayer/i, 'Media Player'],
  [/applemusic|itunes/i, 'Apple Music'],
  [/tidal/i, 'TIDAL'],
  [/deezer/i, 'Deezer'],
  [/youtube/i, 'YouTube Music'],
  [/discord/i, 'Discord'],
];

export function appLabel(id: string): string {
  for (const [re, name] of APPS) if (re.test(id)) return name;
  const base = id.split(/[!\\/]/).pop() ?? id;
  return base.replace(/\.exe$/i, '').replace(/_[a-z0-9]{13}$/i, '') || 'Media';
}

/** One JSON line from the watcher → NowPlaying (null when nothing is playing). */
export function parseNowPlaying(line: string): NowPlaying | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  const s = (k: string): string =>
    typeof o[k] === 'string' ? (o[k] as string).trim().slice(0, 200) : '';
  const title = s('title');
  if (!title) return null;
  const status = s('status');
  return {
    title,
    artist: s('artist'),
    album: s('album'),
    app: appLabel(s('app')),
    playing: /playing/i.test(status),
  };
}
