/** Crash investigation: recent app crashes / hangs and unexpected shutdowns from the Windows
 *  event logs (read-only), for Claude's get_recent_crashes tool. */
import { ps } from './system-actions';

export interface CrashEvent {
  time: string;
  kind: 'app crash' | 'app hang' | 'unexpected shutdown' | 'driver/system error';
  app: string | null;
  detail: string;
}

/** Turn the PowerShell JSON (one object or an array) into tidy events. */
export function parseCrashEvents(json: string): CrashEvent[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json || '[]');
  } catch {
    return [];
  }
  const list = (Array.isArray(raw) ? raw : [raw]) as Array<Record<string, unknown>>;
  return list
    .filter((e) => e && typeof e === 'object')
    .map((e) => {
      const id = Number(e.Id);
      const msg = String(e.Message ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      const kind: CrashEvent['kind'] =
        id === 1000
          ? 'app crash'
          : id === 1002
            ? 'app hang'
            : id === 41 || id === 6008
              ? 'unexpected shutdown'
              : 'driver/system error';
      const app =
        /(?:Faulting application name|The program)\s*:?\s*([^\s,]+\.exe)/i.exec(msg)?.[1] ??
        /Application Name:\s*([^\s,]+)/i.exec(msg)?.[1] ??
        null;
      const module = /Faulting module name:\s*([^\s,]+)/i.exec(msg)?.[1];
      const code = /Exception code:\s*(0x[0-9a-f]+)/i.exec(msg)?.[1];
      const detail =
        kind === 'app crash' && (module || code)
          ? `module ${module ?? '?'}, exception ${code ?? '?'}${explainCode(code)}`
          : msg.slice(0, 300);
      return { time: String(e.Time ?? ''), kind, app, detail };
    });
}

/** Plain-English hints for the most common crash codes. */
export function explainCode(code?: string): string {
  switch ((code ?? '').toLowerCase()) {
    case '0xc0000005':
      return ' (access violation: often a bad mod, overlay, driver or corrupted file)';
    case '0xc0000409':
      return ' (stack buffer overrun: often a mod/overlay conflict or corrupted install)';
    case '0xe0434352':
      return ' (.NET error: often a missing or broken .NET runtime)';
    case '0xc000001d':
      return ' (illegal instruction: CPU feature or unstable overclock)';
    case '0x80000003':
      return ' (breakpoint: the app hit an internal error)';
    case '0xc0000374':
      return ' (heap corruption: often a mod, overlay or memory problem)';
    default:
      return '';
  }
}

const SCRIPT = (days: number): string => `
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$since = (Get-Date).AddDays(-${days})
$a = @(Get-WinEvent -FilterHashtable @{LogName='Application'; Id=1000,1002; StartTime=$since} -MaxEvents 25 -ErrorAction SilentlyContinue)
$s = @(Get-WinEvent -FilterHashtable @{LogName='System'; Id=41,6008; StartTime=$since} -MaxEvents 10 -ErrorAction SilentlyContinue)
@($a + $s) | Sort-Object TimeCreated -Descending | Select-Object -First 30 | ForEach-Object {
  [pscustomobject]@{ Time = $_.TimeCreated.ToString('yyyy-MM-dd HH:mm'); Id = $_.Id; Message = $_.Message }
} | ConvertTo-Json -Compress
`;

/** The get_recent_crashes tool. */
export async function recentCrashes(input: unknown): Promise<unknown> {
  if (process.platform !== 'win32') return { error: 'Crash logs are only available on Windows.' };
  const o = (input && typeof input === 'object' ? input : {}) as { days?: unknown; app?: unknown };
  const days = Math.max(1, Math.min(30, Number(o.days) || 7));
  const r = await ps(SCRIPT(days), 30_000);
  let events = parseCrashEvents(r.out.trim());
  const app = typeof o.app === 'string' ? o.app.toLowerCase().replace(/\.exe$/, '') : '';
  if (app)
    events = events.filter(
      (e) => e.app?.toLowerCase().includes(app) || e.kind === 'unexpected shutdown',
    );
  return events.length
    ? { days, events }
    : { days, events: [], note: 'No crashes, hangs or unexpected shutdowns logged in that time.' };
}
