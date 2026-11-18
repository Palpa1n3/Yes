/** The built-in Task Manager: processes grouped by app, like Windows Task Manager. */

export type TaskKind = 'app' | 'background' | 'windows';

export interface TaskInfo {
  /** Process name without .exe (the group key, and what End task closes). */
  name: string;
  /** Friendly name for well-known programs ("chrome" → "Google Chrome"). */
  label: string;
  count: number;
  /** % of the whole machine (all threads), like Task Manager. */
  cpu: number;
  mem: number;
  kind: TaskKind;
  /** False when a window has stopped responding ("Not responding"). */
  responding: boolean;
  /** Part of Windows or ARC: can't be ended from here. */
  protected: boolean;
}

export interface TaskList {
  /** null while the first CPU sample is being measured (CPU% needs two). */
  tasks: TaskInfo[] | null;
  at: number;
}

export interface EndTaskResult {
  ok: boolean;
  message: string;
  /** The polite close didn't work; offering Force end makes sense. */
  canForce?: boolean;
}

/** One process from the OS (cumulative CPU seconds; Windows extras when available). */
export interface ProcSample {
  pid: number;
  name: string;
  cpuSec: number;
  mem: number;
  window?: boolean;
  responding?: boolean;
  /** Already a CPU% (sources that report it directly instead of cumulative seconds). */
  cpuPct?: number;
}

const FRIENDLY: Record<string, string> = {
  chrome: 'Google Chrome',
  msedge: 'Microsoft Edge',
  firefox: 'Firefox',
  opera: 'Opera',
  opera_gx: 'Opera GX',
  brave: 'Brave',
  explorer: 'Windows Explorer',
  spotify: 'Spotify',
  discord: 'Discord',
  steam: 'Steam',
  steamwebhelper: 'Steam (web helper)',
  code: 'Visual Studio Code',
  winword: 'Microsoft Word',
  excel: 'Microsoft Excel',
  powerpnt: 'Microsoft PowerPoint',
  outlook: 'Outlook',
  olk: 'Outlook',
  ms_teams: 'Microsoft Teams',
  teams: 'Microsoft Teams',
  onedrive: 'OneDrive',
  notepad: 'Notepad',
  vlc: 'VLC media player',
  epicgameslauncher: 'Epic Games Launcher',
  battle_net: 'Battle.net',
  'battle.net': 'Battle.net',
  obs64: 'OBS Studio',
  whatsapp: 'WhatsApp',
  zoom: 'Zoom',
  slack: 'Slack',
  taskmgr: 'Task Manager',
  msmpeng: 'Microsoft Defender',
  searchhost: 'Windows Search',
  svchost: 'Windows services host',
  dwm: 'Desktop Window Manager',
  audiodg: 'Windows audio',
  nvcontainer: 'NVIDIA Container',
  'nvidia share': 'NVIDIA Overlay',
  powershell: 'Windows PowerShell',
  cmd: 'Command Prompt',
  windowsterminal: 'Windows Terminal',
  node: 'Node.js',
  electron: 'ARC (Electron)',
  arc: 'ARC',
};

/** Core Windows processes shown under "Windows processes", like Task Manager does. */
const WINDOWS = new Set([
  'system',
  'registry',
  'smss',
  'csrss',
  'wininit',
  'winlogon',
  'services',
  'lsass',
  'svchost',
  'dwm',
  'fontdrvhost',
  'sihost',
  'ctfmon',
  'taskhostw',
  'runtimebroker',
  'searchhost',
  'searchindexer',
  'startmenuexperiencehost',
  'shellexperiencehost',
  'textinputhost',
  'securityhealthservice',
  'msmpeng',
  'spoolsv',
  'audiodg',
  'lsaiso',
  'memory compression',
  'conhost',
  'dllhost',
  'wudfhost',
  'smartscreen',
  'secure system',
]);

export function friendlyName(name: string): string {
  const key = name.toLowerCase().replace(/\.exe$/, '');
  return FRIENDLY[key] ?? name.replace(/\.exe$/i, '');
}

/** Group a sample by process name, with CPU% from the change since the previous sample. */
export function groupTasks(
  prev: ProcSample[],
  cur: ProcSample[],
  elapsedSec: number,
  threads: number,
  isProtected: (name: string) => boolean,
): TaskInfo[] {
  const before = new Map(prev.map((p) => [p.pid, p.cpuSec]));
  const groups = new Map<string, TaskInfo>();
  for (const p of cur) {
    if (p.pid === 0 || /^(idle|system idle process)$/i.test(p.name)) continue;
    const name = p.name.replace(/\.exe$/i, '');
    const delta = Math.max(0, p.cpuSec - (before.get(p.pid) ?? p.cpuSec));
    const pct =
      p.cpuPct ?? (elapsedSec > 0 ? (delta / elapsedSec / Math.max(1, threads)) * 100 : 0);
    const key = name.toLowerCase();
    const g = groups.get(key);
    if (g) {
      g.cpu += pct;
      g.mem += p.mem;
      g.count += 1;
      if (p.window) g.kind = g.kind === 'windows' ? 'windows' : 'app';
      if (p.window && p.responding === false) g.responding = false;
    } else {
      groups.set(key, {
        name,
        label: friendlyName(name),
        count: 1,
        cpu: pct,
        mem: p.mem,
        kind: WINDOWS.has(key) ? 'windows' : p.window ? 'app' : 'background',
        responding: !(p.window && p.responding === false),
        protected: isProtected(name),
      });
    }
  }
  return [...groups.values()].map((g) => ({
    ...g,
    cpu: Math.round(Math.min(100, g.cpu) * 10) / 10,
  }));
}

export type TaskSort = 'name' | 'cpu' | 'mem';

export function sortTasks(list: TaskInfo[], by: TaskSort, desc: boolean): TaskInfo[] {
  const dir = desc ? -1 : 1;
  return [...list].sort((a, b) => {
    const v =
      by === 'name'
        ? a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
        : by === 'cpu'
          ? a.cpu - b.cpu || a.mem - b.mem
          : a.mem - b.mem;
    return v * dir || a.label.localeCompare(b.label);
  });
}
