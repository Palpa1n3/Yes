/** The app in front (Windows): a long-lived PowerShell reads the foreground window's
 *  process, title and whether it fills the screen every 2 s, printing a JSON line on change.
 *  Used for context ("the user is in Excel"), error pop-ups, app-triggered reminders,
 *  workflow recognition and staying quiet over full-screen apps. */
import { spawn, type ChildProcess } from 'node:child_process';

export interface Foreground {
  app: string;
  title: string;
  fullscreen: boolean;
  since: number;
}

const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class ArcFg {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MI { public int cb; public RECT M; public RECT W; public uint F; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr m, ref MI i);
  public static string Title(IntPtr h) { var s = new StringBuilder(512); GetWindowText(h, s, 512); return s.ToString(); }
  public static bool Full(IntPtr h) {
    RECT r; if (!GetWindowRect(h, out r)) return false;
    var mi = new MI(); mi.cb = Marshal.SizeOf(typeof(MI));
    if (!GetMonitorInfo(MonitorFromWindow(h, 2), ref mi)) return false;
    return r.L <= mi.M.L && r.T <= mi.M.T && r.R >= mi.M.R && r.B >= mi.M.B;
  }
}
'@
[ArcFg]::GetForegroundWindow() | Out-Null
$last = ''
while ($true) {
  $h = [ArcFg]::GetForegroundWindow()
  $p = 0; [ArcFg]::GetWindowThreadProcessId($h, [ref]$p) | Out-Null
  $name = ''; try { $name = (Get-Process -Id $p).ProcessName } catch {}
  $title = [ArcFg]::Title($h)
  $full = [ArcFg]::Full($h) -and $name -ne 'explorer'
  $j = [pscustomobject]@{ app = $name; title = $title; fullscreen = $full } | ConvertTo-Json -Compress
  if ($j -ne $last) { [Console]::Out.WriteLine($j); [Console]::Out.Flush(); $last = $j }
  Start-Sleep -Milliseconds 2000
}
`;

export class ForegroundWatch {
  private proc: ChildProcess | null = null;
  private buf = '';
  private current: Foreground | null = null;
  private stopped = false;
  private listeners: Array<(f: Foreground, prev: Foreground | null) => void> = [];

  constructor(
    private readonly spawnPs: () => ChildProcess = () =>
      spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-EncodedCommand',
          Buffer.from(SCRIPT, 'utf16le').toString('base64'),
        ],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
      ),
    private readonly now: () => number = Date.now,
  ) {}

  get(): Foreground | null {
    return this.current;
  }

  onChange(fn: (f: Foreground, prev: Foreground | null) => void): void {
    this.listeners.push(fn);
  }

  /** Feed raw stdout (exposed for tests). */
  feed(chunk: string): void {
    this.buf += chunk;
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (!line) continue;
      try {
        const j = JSON.parse(line) as { app?: unknown; title?: unknown; fullscreen?: unknown };
        const next: Foreground = {
          app: String(j.app ?? ''),
          title: String(j.title ?? '').slice(0, 200),
          fullscreen: j.fullscreen === true,
          since: this.now(),
        };
        const prev = this.current;
        this.current = next;
        for (const l of this.listeners) l(next, prev);
      } catch {
        /* ignore a garbled line */
      }
    }
  }

  start(): void {
    if (process.platform !== 'win32' || this.proc || this.stopped) return;
    try {
      const p = this.spawnPs();
      this.proc = p;
      p.stdout?.setEncoding('utf8');
      p.stdout?.on('data', (d: string) => this.feed(d));
      p.on('exit', () => {
        this.proc = null;
        if (!this.stopped) setTimeout(() => this.start(), 10_000);
      });
    } catch {
      /* not fatal */
    }
  }

  stop(): void {
    this.stopped = true;
    this.proc?.kill();
    this.proc = null;
  }
}

/** Looks like an error / crash pop-up. */
export function isErrorWindow(f: Foreground): boolean {
  return (
    /^(werfault|wermgr)$/i.test(f.app) ||
    /\b(not responding|has stopped working|fatal error|unhandled exception|application error|crash(ed)?)\b/i.test(
      f.title,
    )
  );
}
