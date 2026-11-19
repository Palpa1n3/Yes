/** OS actions beyond launching: closing apps, volume, media keys, folders, file search,
 *  timers and locking. Windows-first; other platforms get a readable "not supported".
 *  Nothing here runs through a shell: arguments are passed verbatim to fixed programs. */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import type { MediaKey } from '@shared/commands';
import { USER_FOLDERS, type UserFolder } from '@shared/types';
import { describeDuration, type TimerService } from './timer-service';

export interface FoundFile {
  path: string;
  size: number;
  modified: number;
}

export interface SystemActions {
  /** Ask an app to close (like clicking its X), never force-kill. */
  closeApp(processNames: string[]): Promise<{ ok: boolean; message: string }>;
  /** Force-end an app (Task Manager's End task when the polite close didn't work).
   *  Only ever called from the Task Manager after the user confirms; never by the AI. */
  forceEnd(processName: string): Promise<{ ok: boolean; message: string }>;
  setVolume(opts: { level?: number; mute?: boolean }): Promise<{ level: number; muted: boolean }>;
  mediaKey(key: MediaKey): Promise<void>;
  lockScreen(): Promise<void>;
  openFolder(id: UserFolder): Promise<boolean>;
  findFiles(query: string): Promise<FoundFile[]>;
  /** Show a file in Explorer. Only inside the user's own folders; never opens/runs it. */
  revealFile(path: string): Promise<boolean>;
  /** Schedule a reminder; returns when it's due. */
  setTimer(minutes: number, label: string, focus?: boolean): Date;
  /** Cancel timers whose label matches (or all); returns their labels. */
  cancelTimers(query: string): string[];
}

/** Processes ARC refuses to close: Windows itself, and ARC. */
export const PROTECTED_PROCESSES = new Set([
  'explorer',
  'svchost',
  'csrss',
  'winlogon',
  'wininit',
  'lsass',
  'services',
  'smss',
  'dwm',
  'system',
  'registry',
  'fontdrvhost',
  'sihost',
  'ctfmon',
  'taskhostw',
  'runtimebroker',
  'searchhost',
  'startmenuexperiencehost',
  'shellexperiencehost',
  'securityhealthservice',
  'msmpeng',
  'electron',
  'arc',
]);

export const isSafeProcessName = (n: string): boolean =>
  /^[\w.\- ]{1,64}$/.test(n) && !PROTECTED_PROCESSES.has(n.toLowerCase().replace(/\.exe$/, ''));

const run = (
  file: string,
  args: string[],
  timeout = 10_000,
): Promise<{ code: number; out: string }> =>
  new Promise((res) => {
    execFile(file, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      const code =
        err && typeof (err as { code?: unknown }).code === 'number'
          ? (err as { code: number }).code
          : err
            ? 1
            : 0;
      res({ code, out: `${stdout}${stderr}` });
    });
  });

/** PowerShell via -EncodedCommand (UTF-16LE base64): multi-line scripts survive argument quoting. */
export const ps = (script: string, timeout = 15_000): Promise<{ code: number; out: string }> =>
  run(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64'),
    ],
    timeout,
  );

/** Core Audio (default output device) via COM interop: the standard IAudioEndpointVolume layout. */
const AUDIO_TYPE = String.raw`
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, System.Guid pguidEventContext);
  int GetMute(out bool pbMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref System.Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public class ArcAudio {
  static IAudioEndpointVolume Vol() {
    var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice dev = null;
    Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out dev));
    IAudioEndpointVolume epv = null;
    var epvid = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(dev.Activate(ref epvid, 23, 0, out epv));
    return epv;
  }
  public static float Volume {
    get { float v = -1; Marshal.ThrowExceptionForHR(Vol().GetMasterVolumeLevelScalar(out v)); return v; }
    set { Marshal.ThrowExceptionForHR(Vol().SetMasterVolumeLevelScalar(value, System.Guid.Empty)); }
  }
  public static bool Mute {
    get { bool m; Marshal.ThrowExceptionForHR(Vol().GetMute(out m)); return m; }
    set { Marshal.ThrowExceptionForHR(Vol().SetMute(value, System.Guid.Empty)); }
  }
}
'@
`;

const KEYS_TYPE = String.raw`
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public class ArcKeys {
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, System.UIntPtr extra);
  public static void Tap(byte vk) { keybd_event(vk, 0, 1, System.UIntPtr.Zero); keybd_event(vk, 0, 3, System.UIntPtr.Zero); }
}
'@
`;

export const MEDIA_VK: Record<MediaKey, number> = {
  play_pause: 0xb3,
  next: 0xb0,
  previous: 0xb1,
  stop: 0xb2,
};

const SKIP_DIRS = new Set(['node_modules', '.git', 'appdata', '$recycle.bin', 'windows', '.cache']);

/** Name search across folders, newest first. Time-boxed so huge folders can't stall ARC. */
export async function searchFiles(
  roots: string[],
  query: string,
  opts = { budgetMs: 4000, maxDepth: 6, limit: 15 },
): Promise<FoundFile[]> {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return [];
  const deadline = Date.now() + opts.budgetMs;
  const hits: FoundFile[] = [];
  const queue: Array<{ dir: string; depth: number }> = roots.map((dir) => ({ dir, depth: 0 }));
  while (queue.length && Date.now() < deadline && hits.length < opts.limit * 4) {
    const { dir, depth } = queue.shift() as { dir: string; depth: number };
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isSymbolicLink() || e.name.startsWith('.')) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < opts.maxDepth && !SKIP_DIRS.has(e.name.toLowerCase()))
          queue.push({ dir: p, depth: depth + 1 });
        continue;
      }
      const name = e.name.toLowerCase();
      if (!words.every((w) => name.includes(w))) continue;
      const s = await stat(p).catch(() => null);
      if (s) hits.push({ path: p, size: s.size, modified: s.mtimeMs });
    }
  }
  return hits.sort((a, b) => b.modified - a.modified).slice(0, opts.limit);
}

/** True if `p` resolves to somewhere inside one of `roots`. */
export function insideRoots(p: string, roots: string[]): boolean {
  if (!isAbsolute(p)) return false;
  const target = resolve(p);
  return roots.some((r) => {
    const rel = relative(resolve(r), target);
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
  });
}

export interface SystemActionDeps {
  platform: NodeJS.Platform;
  getPath(id: UserFolder): string;
  openPath(p: string): Promise<string>; // Electron shell.openPath: '' on success
  showItemInFolder(p: string): void;
  timers: TimerService;
}

export function createSystemActions(d: SystemActionDeps): SystemActions {
  const win = d.platform === 'win32';
  const notWindows = (): never => {
    throw new Error('That action is only available on Windows for now.');
  };
  const roots = (): string[] => [
    ...new Set(USER_FOLDERS.map((f) => d.getPath(f)).filter((p) => existsSync(p))),
  ];

  return {
    async closeApp(names) {
      if (!win) notWindows();
      const safe = names.filter(isSafeProcessName);
      if (safe.length === 0)
        return {
          ok: false,
          message: "I won't close that one: it's part of Windows or ARC itself.",
        };
      for (const n of safe) {
        const image = n.toLowerCase().endsWith('.exe') ? n : `${n}.exe`;
        // No /F: a polite close request, so apps can still ask to save.
        const r = await run('taskkill.exe', ['/IM', image, '/T']);
        if (r.code === 0)
          return { ok: true, message: `Asked ${basename(image, '.exe')} to close.` };
        if (r.code !== 128)
          return {
            ok: false,
            message: `${basename(image, '.exe')} didn't close; it may be waiting for you to save, or it ignores close requests.`,
          };
      }
      return { ok: false, message: `${safe[0]} doesn't seem to be running.` };
    },

    async forceEnd(name) {
      if (!win) notWindows();
      if (!isSafeProcessName(name))
        return {
          ok: false,
          message: "That one can't be ended: it's part of Windows or ARC itself.",
        };
      const image = name.toLowerCase().endsWith('.exe') ? name : `${name}.exe`;
      const r = await run('taskkill.exe', ['/F', '/IM', image, '/T']);
      if (r.code === 0) return { ok: true, message: `Ended ${basename(image, '.exe')}.` };
      if (r.code === 128)
        return { ok: true, message: `${basename(image, '.exe')} has already closed.` };
      return {
        ok: false,
        message: `Windows wouldn't end ${basename(image, '.exe')}. It may be running as administrator.`,
      };
    },

    async setVolume({ level, mute }) {
      if (!win) notWindows();
      const lines = [AUDIO_TYPE];
      if (typeof level === 'number')
        lines.push(`[ArcAudio]::Volume = ${Math.max(0, Math.min(100, Math.round(level))) / 100}`);
      if (typeof mute === 'boolean') lines.push(`[ArcAudio]::Mute = $${mute}`);
      lines.push(
        'Write-Output ("{0}|{1}" -f [math]::Round([ArcAudio]::Volume * 100), [ArcAudio]::Mute)',
      );
      const r = await ps(lines.join('\n'));
      const m = r.out.match(/(\d+)\|(True|False)/);
      if (!m) throw new Error("Couldn't reach the Windows volume control.");
      return { level: Number(m[1]), muted: m[2] === 'True' };
    },

    async mediaKey(key) {
      if (!win) notWindows();
      const r = await ps(`${KEYS_TYPE}\n[ArcKeys]::Tap(${MEDIA_VK[key]})`);
      if (r.code !== 0) throw new Error("Couldn't send the media key.");
    },

    async lockScreen() {
      if (!win) notWindows();
      await run('rundll32.exe', ['user32.dll,LockWorkStation']);
    },

    async openFolder(id) {
      const p = d.getPath(id);
      if (!existsSync(p)) return false;
      return (await d.openPath(p)) === '';
    },

    findFiles: (query) => searchFiles(roots(), query),

    async revealFile(p) {
      if (!insideRoots(p, roots()) || !existsSync(p)) return false;
      d.showItemInFolder(resolve(p));
      return true;
    },

    setTimer(minutes, label, focus) {
      return new Date(d.timers.add(minutes, label, focus ? 'focus' : undefined).dueAt);
    },

    cancelTimers(query) {
      return d.timers
        .cancelMatching(query)
        .map((t) => t.label || describeDuration(t.durationMs / 60_000) + ' timer');
    },
  };
}
