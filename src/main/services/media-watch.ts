/** Windows only: a long-lived PowerShell process reads the system media session
 *  (GlobalSystemMediaTransportControls) every 1.5 s and prints a JSON line when the song or
 *  play state changes (and every 20 s while playing, for the position). The album art is sent
 *  once per song, as base64. */
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
[Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
$lastKey = ''
$lastPrint = [DateTime]::MinValue
$song = ''
while ($true) {
  $j = '{}'
  $key = '{}'
  $playing = $false
  try {
    $s = $mgr.GetCurrentSession()
    if ($s) {
      $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $st = [string]$s.GetPlaybackInfo().PlaybackStatus
      $playing = $st -eq 'Playing'
      $tl = $s.GetTimelineProperties()
      $pos = [math]::Round($tl.Position.TotalSeconds)
      $dur = [math]::Round(($tl.EndTime - $tl.StartTime).TotalSeconds)
      $id = "$($s.SourceAppUserModelId)|$($p.Title)|$($p.Artist)"
      $key = "$id|$st"
      $art = $null
      if ($id -ne $song) {
        $song = $id
        try {
          if ($p.Thumbnail) {
            $ras = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
            $rs = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($ras)
            $ms = New-Object IO.MemoryStream
            $rs.CopyTo($ms)
            if ($ms.Length -gt 0 -and $ms.Length -lt 400000) { $art = [Convert]::ToBase64String($ms.ToArray()) }
          }
        } catch { $art = $null }
        if (-not $art) { $art = '' }
      }
      $o = [ordered]@{ app = $s.SourceAppUserModelId; title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle; status = $st; pos = $pos; dur = $dur }
      if ($null -ne $art) { $o.art = $art }
      $j = [pscustomobject]$o | ConvertTo-Json -Compress
    }
  } catch { $j = '{}'; $key = '{}' }
  $now = Get-Date
  if ($key -ne $lastKey -or ($playing -and ($now - $lastPrint).TotalSeconds -ge 20)) {
    [Console]::Out.WriteLine($j); [Console]::Out.Flush(); $lastKey = $key; $lastPrint = $now
  }
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
      // The art comes once per song: keep it while the same song carries on.
      if (next && next.art === undefined && this.current && this.current.title === next.title)
        next.art = this.current.art;
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
