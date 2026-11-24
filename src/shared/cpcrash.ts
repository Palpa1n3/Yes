/** Cyberpunk crashes while playing: reads the crash reports AppearanceRuntimePlugin writes
 *  (red4ext\plugins\AppearanceRuntimePlugin\Logs\crash-*.txt: where it crashed and which modules
 *  were on the stack), the game's CrashInfo.json (quest, district, minutes played) and TweakXL's
 *  errors. A mod that is on the stack crash after crash is the one to switch off; shared
 *  frameworks (Codeware, ArchiveXL…) are only reported, since many mods need them. Pure;
 *  tested in tests/cpcrash.test.ts. */

export interface CrashProbe {
  file: string;
  at: number;
  /** "Cyberpunk2077.exe+0x278938" or "RadioExt.dll+0x6B10". */
  where: string;
  /** Mod DLLs on the stack (not Windows, not the game, not RED4ext itself). */
  mods: string[];
}

/** Frameworks lots of mods depend on: never switched off by Alton. */
const FRAMEWORKS = new Set(
  [
    'codeware',
    'archivexl',
    'tweakxl',
    'red4ext',
    'cyber_engine_tweaks',
    'input_loader',
    'mod_settings',
    'redfilesystem',
    'redhttpclient',
    'audioware',
    'appearanceruntimeplugin',
  ].map((x) => x.toLowerCase()),
);
/** Plugins that only report or load things for everyone: never blamed for a crash by timing. */
const NEVER_LEAD = new Set([...FRAMEWORKS].filter((f) => f !== 'appearanceruntimeplugin'));

export interface PluginLogLine {
  at: number;
  text: string;
}

/** One RED4ext plugin log line: "[2026-11-24 17:53:11.409] [info    ] [ 67812] [Plugin] text". */
export function parsePluginLogLine(line: string): PluginLogLine | null {
  const m = /^\[(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$/.exec(
    line,
  );
  if (!m) return null;
  const n = m.slice(1, 8).map((x) => Number(x ?? 0));
  const at = new Date(
    n[0] ?? 0,
    (n[1] ?? 1) - 1,
    n[2] ?? 1,
    n[3] ?? 0,
    n[4] ?? 0,
    n[5] ?? 0,
    n[6] ?? 0,
  ).getTime();
  return { at, text: m[8] ?? '' };
}

/** The same plugin doing the same thing in the seconds before most of the recent crashes at
 *  one spot in the game's code (with only frameworks on the stack): that plugin is the likely
 *  cause. `logs`: plugin (DLL name, lower case) → its log lines from those sessions. */
export function repeatedLead(
  crashes: Array<{ at: number; where: string }>,
  logs: Map<string, PluginLogLine[]>,
  windowMs = 8000,
): { plugin: string; message: string; times: number } | null {
  const last = crashes[crashes.length - 1];
  if (!last) return null;
  const same = crashes.filter((c) => c.where === last.where && c.at > 0);
  if (same.length < 3) return null;
  const norm = (t: string): string =>
    t
      .replace(/^\[[^\]]*\]\s*\[\s*\d+\]\s*/, '')
      .replace(/0x[0-9a-f]+/gi, '#')
      .replace(/\d+/g, '#')
      .trim();
  let best: { plugin: string; message: string; times: number } | null = null;
  for (const [plugin, lines] of logs) {
    if (NEVER_LEAD.has(plugin.toLowerCase())) continue;
    const counts = new Map<string, number>();
    for (const c of same) {
      const msgs = new Set(
        lines
          .filter((l) => l.at <= c.at && c.at - l.at <= windowMs && !/crash/i.test(l.text))
          .map((l) => norm(l.text)),
      );
      for (const m of msgs) counts.set(m, (counts.get(m) ?? 0) + 1);
    }
    for (const [message, times] of counts)
      if (times >= Math.max(3, same.length - 1) && (!best || times > best.times))
        best = { plugin, message, times };
  }
  return best;
}

export const isFramework = (dll: string): boolean =>
  FRAMEWORKS.has(
    dll
      .replace(/\.(dll|asi)$/i, '')
      .replace(/_2_\d+$/, '')
      .toLowerCase(),
  );

const SYSTEM =
  /^(ntdll|kernel32|kernelbase|ucrtbase|msvcp|vcruntime|user32|combase|win32u|d3d12|dxgi|nv|amd|gdi32)/i;

export function parseCrashProbe(file: string, text: string): CrashProbe | null {
  const head = /ARP [\d.]+, commit \w+, (\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(text);
  const where = /(?:ACCESS VIOLATION|EXCEPTION[^:]*): ([\w.-]+\+0x[0-9A-F]+)/i.exec(text)?.[1];
  if (!where) return null;
  const n = head ? head.slice(1, 7).map(Number) : [];
  const at = head
    ? new Date(n[0] ?? 0, (n[1] ?? 1) - 1, n[2] ?? 1, n[3] ?? 0, n[4] ?? 0, n[5] ?? 0).getTime()
    : 0;
  const mods = new Set<string>();
  for (const m of [where, ...text.matchAll(/\]\s+([\w.-]+\.(?:dll|asi))\+0x/gi)].map((x) =>
    typeof x === 'string' ? x.replace(/\+0x.*$/, '') : (x[1] ?? ''),
  )) {
    if (!/\.(dll|asi)$/i.test(m) || SYSTEM.test(m) || /^RED4ext\.dll$/i.test(m)) continue;
    mods.add(m);
  }
  return { file, at, where, mods: [...mods] };
}

export interface CrashContext {
  quest: string;
  district: string;
  /** Seconds played before the crash. */
  session: number;
  at: number;
  /** Where V was when it crashed (world coordinates), if the game said. */
  position?: { x: number; y: number; z: number } | null;
}

/** Coordinates written in a mod's code (Lua tables like `{ x = 600, y = -5325, z = 901 }` or
 *  `Vector4.new(600, -5325, 901, 1)`) within `near` metres of `pos`: the mod sends V (or builds
 *  something) right where the game crashed. */
export function placesNear(
  src: string,
  pos: { x: number; y: number; z: number },
  near = 5,
): boolean {
  const num = String.raw`(-?\d+(?:\.\d+)?)`;
  const sep = String.raw`\s*,\s*`;
  const patterns = [
    new RegExp(
      String.raw`x\s*=\s*` +
        num +
        sep +
        String.raw`y\s*=\s*` +
        num +
        sep +
        String.raw`z\s*=\s*` +
        num,
      'g',
    ),
    new RegExp(String.raw`Vector4\.new\(\s*` + num + sep + num + sep + num, 'g'),
    new RegExp(String.raw`new\s+Vector4\(\s*` + num + sep + num + sep + num, 'g'),
  ];
  for (const re of patterns)
    for (const m of src.matchAll(re)) {
      const [x, y, z] = [Number(m[1]), Number(m[2]), Number(m[3])];
      // Far from the map's middle only: (0, 0, 0)-ish placeholders don't count.
      if (Math.abs(x) + Math.abs(y) < 50) continue;
      if (Math.abs(x - pos.x) <= near && Math.abs(y - pos.y) <= near && Math.abs(z - pos.z) <= near)
        return true;
    }
  return false;
}

export function parseCrashInfo(json: string): CrashContext | null {
  try {
    const d = (JSON.parse(json) as { Data?: { postMortem?: Record<string, unknown> } }).Data
      ?.postMortem;
    if (!d) return null;
    const q = (d.trackedQuest ?? {}) as { name?: string };
    const l = (d.location ?? {}) as { X?: unknown; Y?: unknown; Z?: unknown };
    const [x, y, z] = [Number(l.X), Number(l.Y), Number(l.Z)];
    return {
      position:
        Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) && (x || y || z)
          ? { x, y, z }
          : null,
      quest: String(q.name ?? ''),
      district: String(d.district ?? ''),
      session: Number(d.sessionLength) || 0,
      at: Date.parse(String(d.timeCrash ?? '')) || 0,
    };
  } catch {
    return null;
  }
}

export interface CrashSummary {
  recent: CrashProbe[];
  /** A mod (not a framework) on the stack of the last two crashes: switch it off. */
  culprit: { dll: string; plugin: string | null; times: number } | null;
  /** Frameworks seen on the last crash's stack (reported, never switched off). */
  frameworks: string[];
  context: CrashContext | null;
  tweakErrors: { count: number; examples: string[] };
  verdict: string;
}

/** `plugins`: DLL name (no extension, lower case) → its RED4ext plugin folder. */
export function summarizeCrashes(
  crashes: CrashProbe[],
  plugins: Map<string, string>,
  context: CrashContext | null,
  tweakLog = '',
): CrashSummary {
  const recent = [...crashes].sort((a, b) => a.at - b.at).slice(-6);
  const last = recent[recent.length - 1];
  const prev = recent[recent.length - 2];
  const stem = (d: string): string => d.replace(/\.(dll|asi)$/i, '').toLowerCase();
  // The game's own crash record is newer than any crash report: a crash the reporter missed
  // (then older reports say nothing about it, so nobody is blamed).
  const unreported = !!context?.at && context.at > (last?.at ?? 0) + 60_000;
  let culprit: CrashSummary['culprit'] = null;
  if (last && !unreported) {
    for (const d of last.mods) {
      if (isFramework(d)) continue;
      const times = recent.filter((c) => c.mods.includes(d)).length;
      if (prev?.mods.includes(d) || last.where.toLowerCase().startsWith(d.toLowerCase())) {
        const base = stem(d).replace(/_2_\d+$/, '');
        culprit = { dll: d, plugin: plugins.get(stem(d)) ?? plugins.get(base) ?? null, times };
        break;
      }
    }
  }
  const frameworks = last && !unreported ? last.mods.filter(isFramework) : [];
  const errs = tweakLog.split(/\r?\n/).filter((l) => /\]\s*\[error\]/i.test(l));
  const tweakErrors = {
    count: errs.length,
    examples: errs.slice(0, 5).map((l) => l.replace(/^.*\[error\]\s*/i, '')),
  };
  const parts: string[] = [];
  if (unreported && context) {
    const mins = Math.max(1, Math.round(context.session / 60));
    parts.push(
      `The game crashed after ${mins} minute${mins === 1 ? '' : 's'} of play${context.district ? ` in ${context.district}` : ''}. No crash report says where, so no single mod can be blamed; the likeliest causes are mods made for an older game version (Outdated mods) or a missing framework.`,
    );
  }
  if (last && !unreported) {
    const when = context?.session
      ? ` after ${Math.round(context.session / 60) || 1} minute${Math.round(context.session / 60) === 1 ? '' : 's'} of play${context.district ? ` in ${context.district}` : ''}`
      : '';
    if (culprit)
      parts.push(
        `The game crashed${when}${when ? ',' : ''} inside the mod “${culprit.dll}”${culprit.times > 1 ? ` (${culprit.times} crashes in a row)` : ''}. Switch it off or update it.`,
      );
    else if (frameworks.length)
      parts.push(
        `The game crashed${when}${when ? ',' : ''} in its own code, with ${frameworks.join(', ')} involved. That’s a framework many mods use, so it’s usually a mod built on it that’s out of date, not the framework itself.`,
      );
    else
      parts.push(
        `The game crashed${when}${when ? ',' : ''} in its own code; no mod was on the crash’s stack.`,
      );
    if (tweakErrors.count)
      parts.push(
        `TweakXL rejected ${tweakErrors.count} change${tweakErrors.count === 1 ? '' : 's'} from mods made for an older game version (see below): update those mods if the crashes carry on.`,
      );
  }
  return { recent, culprit, frameworks, context, tweakErrors, verdict: parts.join(' ') };
}
