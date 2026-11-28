/** Windows mouse + keyboard for Agent Mode: one long-lived PowerShell process with a small
 *  C# helper (user32 SendInput / SetCursorPos). Commands go in one per line on stdin;
 *  each answers one line ("ok", "pos X Y" or "err …"). Coordinates are physical pixels. */
import { spawn, type ChildProcess } from 'node:child_process';
import { EXTENDED_VK } from '@shared/agent';
import type { UiPart } from '@shared/tool-guard';

const CS = `
using System;
using System.Threading;
using System.Runtime.InteropServices;
public static class ArcInput {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] public struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public UNION u; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  static void Send(INPUT i) { SendInput(1, new INPUT[] { i }, Marshal.SizeOf(typeof(INPUT))); }
  static INPUT Mouse(uint flags, uint data) { INPUT i = new INPUT(); i.type = 0; i.u.mi.dwFlags = flags; i.u.mi.mouseData = data; return i; }
  public static void Button(string b, bool down) {
    uint f = b == "right" ? (down ? 0x0008u : 0x0010u) : b == "middle" ? (down ? 0x0020u : 0x0040u) : (down ? 0x0002u : 0x0004u);
    Send(Mouse(f, 0));
  }
  public static void Wheel(int vertical, int horizontal) {
    if (vertical != 0) Send(Mouse(0x0800, unchecked((uint)(vertical * 120))));
    if (horizontal != 0) Send(Mouse(0x1000, unchecked((uint)(horizontal * 120))));
  }
  public static void Key(int vk, bool down, bool extended) {
    INPUT i = new INPUT(); i.type = 1; i.u.ki.wVk = (ushort)vk;
    i.u.ki.dwFlags = (down ? 0u : 0x0002u) | (extended ? 0x0001u : 0u);
    Send(i);
  }
  public static void Type(string s) {
    foreach (char c in s) {
      if (c == '\\r') continue;
      if (c == '\\n') { Key(0x0D, true, false); Key(0x0D, false, false); Thread.Sleep(10); continue; }
      INPUT d = new INPUT(); d.type = 1; d.u.ki.wScan = c; d.u.ki.dwFlags = 0x0004;
      INPUT u = d; u.u.ki.dwFlags = 0x0004 | 0x0002;
      Send(d); Send(u); Thread.Sleep(6);
    }
  }
}
`;

const SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
${CS}
'@
[ArcInput]::SetProcessDPIAware() | Out-Null
$uia = $true
try { Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, WindowsBase } catch { $uia = $false }
function Describe-Element($e, $depth) {
  $parts = @()
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $i = 0
  while ($e -ne $null -and $i -lt $depth) {
    $parts += ($e.Current.ControlType.ProgrammaticName + [char]9 + $e.Current.Name)
    $e = $walker.GetParent($e)
    $i++
  }
  return 'ui ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($parts -join [char]10)))
}
[Console]::Out.WriteLine('ready'); [Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $a = $line.Split(' ')
  try {
    switch ($a[0]) {
      'move' { [ArcInput]::SetCursorPos([int]$a[1], [int]$a[2]) | Out-Null; $r = 'ok' }
      'btn' { [ArcInput]::Button($a[1], $a[2] -eq 'down'); $r = 'ok' }
      'wheel' { [ArcInput]::Wheel([int]$a[1], [int]$a[2]); $r = 'ok' }
      'key' { [ArcInput]::Key([int]$a[1], $a[2] -eq 'down', $a[3] -eq '1'); $r = 'ok' }
      'type' { [ArcInput]::Type([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($a[1]))); $r = 'ok' }
      'label' { if (-not $uia) { throw 'no ui automation' }; $pt = New-Object System.Windows.Point([double]$a[1], [double]$a[2]); $r = Describe-Element ([System.Windows.Automation.AutomationElement]::FromPoint($pt)) 3 }
      'focus' { if (-not $uia) { throw 'no ui automation' }; $r = Describe-Element ([System.Windows.Automation.AutomationElement]::FocusedElement) 1 }
      'pos' { $p = New-Object ArcInput+POINT; [ArcInput]::GetCursorPos([ref]$p) | Out-Null; $r = "pos $($p.X) $($p.Y)" }
      default { $r = 'err unknown' }
    }
  } catch { $r = 'err ' + $_.Exception.Message.Replace([char]10, ' ') }
  [Console]::Out.WriteLine($r); [Console]::Out.Flush()
}
`;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The low-level moves Agent Mode needs. */
export interface InputBackend {
  move(x: number, y: number): Promise<void>;
  button(which: 'left' | 'right' | 'middle', down: boolean): Promise<void>;
  /** Clicks of the wheel: +up / −down, +right / −left. */
  wheel(vertical: number, horizontal: number): Promise<void>;
  key(vk: number, down: boolean): Promise<void>;
  type(text: string): Promise<void>;
  cursor(): Promise<{ x: number; y: number }>;
  /** What's under a screen point: the element and up to two parents (UI Automation). */
  labelAt?(x: number, y: number): Promise<UiPart[]>;
  /** The element with keyboard focus. */
  focused?(): Promise<UiPart[]>;
  close(): void;
}

export class WinInput implements InputBackend {
  private proc: ChildProcess | null = null;
  private buf = '';
  private waiting: Array<(line: string) => void> = [];
  private ready: Promise<void> | null = null;

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
        { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] },
      ),
  ) {}

  private start(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      const p = this.spawnPs();
      this.proc = p;
      const timer = setTimeout(() => reject(new Error('The input helper did not start.')), 20_000);
      this.waiting.push(() => {
        clearTimeout(timer);
        resolve();
      });
      p.stdout?.setEncoding('utf8');
      p.stdout?.on('data', (d: string) => this.feed(d));
      p.on('exit', () => {
        this.proc = null;
        this.ready = null;
        for (const w of this.waiting.splice(0)) w('err the input helper stopped');
      });
      p.on('error', (e) => reject(e));
    });
    return this.ready;
  }

  /** Feed raw stdout (exposed for tests). */
  feed(chunk: string): void {
    this.buf += chunk;
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (line) this.waiting.shift()?.(line);
    }
  }

  private async cmd(line: string): Promise<string> {
    await this.start();
    const reply = new Promise<string>((resolve) => this.waiting.push(resolve));
    this.proc?.stdin?.write(`${line}\n`);
    const r = await Promise.race([reply, sleep(30_000).then(() => 'err timed out')]);
    if (r.startsWith('err')) throw new Error(r.slice(4) || 'input failed');
    return r;
  }

  async move(x: number, y: number): Promise<void> {
    await this.cmd(`move ${Math.round(x)} ${Math.round(y)}`);
  }
  async button(which: 'left' | 'right' | 'middle', down: boolean): Promise<void> {
    await this.cmd(`btn ${which} ${down ? 'down' : 'up'}`);
  }
  async wheel(vertical: number, horizontal: number): Promise<void> {
    await this.cmd(`wheel ${Math.round(vertical)} ${Math.round(horizontal)}`);
  }
  async key(vk: number, down: boolean): Promise<void> {
    await this.cmd(`key ${vk} ${down ? 'down' : 'up'} ${EXTENDED_VK.has(vk) ? 1 : 0}`);
  }
  async type(text: string): Promise<void> {
    // Long text in chunks so one line never gets huge.
    for (let i = 0; i < text.length; i += 200)
      await this.cmd(`type ${Buffer.from(text.slice(i, i + 200), 'utf8').toString('base64')}`);
  }
  async cursor(): Promise<{ x: number; y: number }> {
    const [, x, y] = (await this.cmd('pos')).split(' ');
    return { x: Number(x), y: Number(y) };
  }
  async labelAt(x: number, y: number): Promise<UiPart[]> {
    return parseUi(await this.cmd(`label ${Math.round(x)} ${Math.round(y)}`));
  }
  async focused(): Promise<UiPart[]> {
    return parseUi(await this.cmd('focus'));
  }
  close(): void {
    this.proc?.stdin?.end();
    this.proc?.kill();
    this.proc = null;
    this.ready = null;
  }
}

/** "ui <base64>" → the element parts (type, name), nearest first. */
export function parseUi(line: string): UiPart[] {
  const b64 = line.startsWith('ui ') ? line.slice(3).trim() : '';
  if (!b64) return [];
  return Buffer.from(b64, 'base64')
    .toString('utf8')
    .split(String.fromCharCode(10))
    .filter(Boolean)
    .map((l) => {
      const tab = l.indexOf(String.fromCharCode(9));
      return tab < 0 ? { type: '', name: l } : { type: l.slice(0, tab), name: l.slice(tab + 1) };
    });
}
