/** Windows only: a long-lived PowerShell process reads the system media session
 *  (GlobalSystemMediaTransportControls) every 1.5 s and prints a JSON line when it changes. */
import { spawn, type ChildProcess } from 'node:child_process';
import { parseNowPlaying, type NowPlaying } from '@shared/media';

const SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$last = ''
while ($true) {
  $j = '{}'
  try {
    $s = $mgr.GetCurrentSession()
    if ($s) {
      $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $st = [string]$s.GetPlaybackInfo().PlaybackStatus
      $j = [pscustomobject]@{ app = $s.SourceAppUserModelId; title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle; status = $st } | ConvertTo-Json -Compress
    }
  } catch { $j = '{}' }
  if ($j -ne $last) { [Console]::Out.WriteLine($j); [Console]::Out.Flush(); $last = $j }
  Start-Sleep -Milliseconds 1500
}
`;

export class MediaWatcher {
  private proc: ChildProcess | null = null;
  private current: NowPlaying | null = null;
  private stopped = false;
  private buf = '';
  private restartTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly onChange: (n: NowPlaying | null) => void,
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
  ) {}

  get(): NowPlaying | null {
    return this.current;
  }

  /** Feed raw stdout (exposed for tests). */
  feed(chunk: string): void {
    this.buf += chunk;
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (!line) continue;
      const next = parseNowPlaying(line);
      if (JSON.stringify(next) !== JSON.stringify(this.current)) {
        this.current = next;
        this.onChange(next);
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
        if (this.current) {
          this.current = null;
          this.onChange(null);
        }
        // Restart later if it dies (e.g. after sleep); not in a tight loop.
        if (!this.stopped) this.restartTimer = setTimeout(() => this.start(), 30_000);
      });
      p.on('error', () => undefined);
    } catch {
      /* PowerShell unavailable: no now-playing */
    }
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.restartTimer);
    this.proc?.kill();
    this.proc = null;
  }
}
