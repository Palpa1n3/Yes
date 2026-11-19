/** Gaming mode: spot a running game, then boost and quieten the PC until it closes. */

export interface GamingStatus {
  active: boolean;
  /** Friendly game name ("Cyberpunk2077"), when known. */
  game: string | null;
  since: number | null;
  /** True when started by hand rather than by spotting a game. */
  manual: boolean;
  /** What was done ("High performance power plan", "Closed Chrome"). */
  actions: string[];
}

export const IDLE_GAMING: GamingStatus = {
  active: false,
  game: null,
  since: null,
  manual: false,
  actions: [],
};

/** Process names of popular games (lower-case, no .exe). Library folders catch the rest. */
const KNOWN = [
  /^cod(\d+)?$/,
  /^cod[-_]/,
  /modernwarfare|blackops/,
  /^cyberpunk2077$/,
  /^fortniteclient/,
  /^valorant-win64-shipping$/,
  /^r5apex/,
  /^cs2$/,
  /^dota2$/,
  /^league of legends$/,
  /^overwatch$/,
  /^rocketleague$/,
  /^gta5(_enhanced)?$/,
  /^playgtav$/,
  /^rdr2$/,
  /^eldenring$/,
  /^destiny2$/,
  /^bg3(_dx11)?$/,
  /^starfield$/,
  /^helldivers2$/,
  /^rainbowsix/,
  /^tslgame$/,
  /^wow$/,
  /^diablo iv$/,
  /^fc2[4-9]$/,
  /^minecraft\.windows$/,
  /^palworld/,
  /^rustclient$/,
  /^hogwartslegacy$/,
  /^witcher3$/,
  /^re4$/,
];

/** Folders games install into. */
const LIBRARIES =
  /[\\/](steamapps[\\/]common|epic games|xboxgames|riot games|call of duty|ea games|ubisoft game launcher[\\/]games|gog galaxy[\\/]games|curseforge[\\/]minecraft|\.minecraft)[\\/]/i;

/** Launchers, helpers, installers and anti-cheat: running, but not "playing". */
const NOT_GAMES =
  /^(steam|steamwebhelper|steamservice|steamerrorreporter|epicgameslauncher|epicwebhelper|battle\.net|agent|blizzard.*|crashreport.*|.*crashhandler.*|unitycrashhandler(32|64)?|easyanticheat.*|beservice|vc_redist.*|dxsetup|ue4prereqsetup.*|.*setup.*|.*install.*|.*updater.*|origin.*|eadesktop|eabackgroundservice|riotclient.*|ubisoftconnect|upc|uplaywebcore|galaxyclient.*|curseforge|overwolf.*)$/i;

export function isGame(name: string, path: string | null, extra: readonly string[] = []): boolean {
  const n = name.toLowerCase().replace(/\.exe$/, '');
  if (NOT_GAMES.test(n)) return false;
  if (extra.some((e) => e.toLowerCase().replace(/\.exe$/, '') === n)) return true;
  if (KNOWN.some((re) => re.test(n))) return true;
  return !!path && LIBRARIES.test(path);
}

export function gameLabel(name: string): string {
  const n = name.replace(/\.exe$/i, '');
  if (/^cod|modernwarfare|blackops/i.test(n)) return 'Call of Duty';
  if (/^cyberpunk/i.test(n)) return 'Cyberpunk 2077';
  if (/^fortnite/i.test(n)) return 'Fortnite';
  if (/^valorant/i.test(n)) return 'VALORANT';
  if (/^r5apex/i.test(n)) return 'Apex Legends';
  if (/^javaw$/i.test(n)) return 'Minecraft';
  return n.replace(/-Win64-Shipping$/i, '').replace(/[-_]/g, ' ');
}

/** Download mode: everything set aside so Steam gets the connection. */
export interface DownloadStatus {
  active: boolean;
  since: number;
  /** What Steam is downloading or updating, with progress text. */
  games: Array<{ name: string; progress: string }>;
  /** Apps closed for it (reopened afterwards). */
  closed: string[];
  /** What was done, and any tips (e.g. a Steam download limit is set). */
  notes: string[];
  /** What happens when the downloads finish. */
  then: 'none' | 'shutdown' | 'sleep';
}

export const IDLE_DOWNLOAD: DownloadStatus = {
  active: false,
  since: 0,
  games: [],
  closed: [],
  notes: [],
  then: 'none',
};

/** Apps that use a lot of bandwidth in the background: cloud sync, other game launchers,
 *  torrent clients. Process names without .exe (browsers are left alone: open tabs). */
export const BANDWIDTH_HOGS = [
  'OneDrive',
  'Dropbox',
  'GoogleDriveFS',
  'iCloudDrive',
  'MEGAsync',
  'EpicGamesLauncher',
  'Battle.net',
  'EADesktop',
  'Origin',
  'upc',
  'GalaxyClient',
  'RiotClientServices',
  'qbittorrent',
  'uTorrent',
  'BitTorrent',
  'deluge',
  'transmission-qt',
];
