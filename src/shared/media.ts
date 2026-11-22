/** What's playing (from Windows' media controls: Spotify, browsers, media apps…). */
export interface NowPlaying {
  title: string;
  artist: string;
  album: string;
  /** Friendly app name ("Spotify", "Chrome"). */
  app: string;
  playing: boolean;
  /** Seconds into the song and its length (null when the app doesn't say). */
  position?: number | null;
  duration?: number | null;
  /** When the position was read (ms), so the progress bar can move on between updates. */
  at?: number;
  /** Album art as a data URL ('' = none; undefined = unchanged since the last update). */
  art?: string;
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
  const num = (k: string): number | null =>
    typeof o[k] === 'number' && Number.isFinite(o[k]) && (o[k] as number) >= 0
      ? (o[k] as number)
      : null;
  const n: NowPlaying = {
    title,
    artist: s('artist'),
    album: s('album'),
    app: appLabel(s('app')),
    playing: /playing/i.test(status),
  };
  const dur = num('dur');
  if (dur) {
    n.duration = dur;
    n.position = Math.min(dur, num('pos') ?? 0);
    n.at = Date.now();
  }
  if (typeof o['art'] === 'string')
    n.art = /^[A-Za-z0-9+/=]{100,}$/.test(o['art']) ? `data:image/jpeg;base64,${o['art']}` : '';
  return n;
}
