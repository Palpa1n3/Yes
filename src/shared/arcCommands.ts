/** Commands that control ARC itself ("new chat", "open notes", "start gaming mode"…).
 *  Recognised locally (instant, no AI) and also offered to Claude as a tool. */
import type { RawIntent } from './types';

export const ARC_ACTIONS = [
  'open_tab',
  'open_settings',
  'new_chat',
  'research',
  'research_on',
  'research_off',
  'switch_chat',
  'export_chat',
  'pin_chat',
  'rename_chat',
  'scan_space',
  'gaming_on',
  'gaming_off',
  'open_mic_on',
  'open_mic_off',
  'whisper_on',
  'whisper_off',
] as const;
export type ArcAction = (typeof ARC_ACTIONS)[number];

export interface ArcCommand {
  action: ArcAction;
  value?: string;
}

export const ARC_TABS = [
  'overview',
  'chat',
  'notes',
  'system',
  'tasks',
  'apps',
  'network',
  'storage',
  'routines',
] as const;
export type ArcTab = (typeof ARC_TABS)[number];

const TAB_WORDS: Array<[RegExp, ArcTab]> = [
  [/^(overview|home|dashboard|main screen|hud)$/, 'overview'],
  [/^(chats?|conversations?|chat history)$/, 'chat'],
  [/^(notes?|lists?|notebook|memor(y|ies)|to-?do( list)?|shopping list)$/, 'notes'],
  [/^(system|performance|cpu|hardware)$/, 'system'],
  [/^(tasks?|task manager|processes|running apps)$/, 'tasks'],
  [/^(apps|applications|programs|app launcher)$/, 'apps'],
  [/^(network|internet|wi-?fi|connection)$/, 'network'],
  [/^(storage|drives?|disks?|disk space|space)$/, 'storage'],
  [/^(routines?|automations?)$/, 'routines'],
];

const SETTINGS_WORDS: Array<[RegExp, string]> = [
  [/^(general)$/, 'general'],
  [/^(personality)$/, 'personality'],
  [/^(appearance|theme|look)$/, 'appearance'],
  [/^(voice|speech|microphone|mic)$/, 'voice'],
  [/^(gaming|game|games)$/, 'gaming'],
  [/^(hotkeys?|shortcuts?|keyboard)$/, 'hotkeys'],
  [/^(ai|claude|api key|model|ollama|local ai)$/, 'ai'],
  [/^(smart|smart features|awareness|initiative|suggestions|memory|agent mode)$/, 'smart'],
  [/^(connections?|accounts?|email|gmail|calendar|discord|phone( companion)?)$/, 'connections'],
  [/^(privacy|permissions|security|backups?)$/, 'privacy'],
  [/^(advanced|updates?|plugins?|data)$/, 'advanced'],
];

const tabFor = (w: string): ArcTab | null => TAB_WORDS.find(([re]) => re.test(w))?.[1] ?? null;

/** Strip politeness and filler so "hey arc, could you open my notes please?" → "open notes". */
export function normaliseCommand(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”"!?.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:(?:hey|ok|okay) )?(?:arc )?/, '')
    .replace(
      /^(?:please |can you |could you |would you |will you |i want to |i'd like to |let's |lets )+/,
      '',
    )
    .replace(/(?: for me| please| now| tab| page| screen)+$/, '')
    .replace(/\b(?:the|my)\b ?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A command for ARC itself, a media key, or null (not one of ours). */
export function parseArcCommand(text: string): ArcCommand | RawIntent | null {
  const t = normaliseCommand(text);
  if (!t || t.length > 120) return null;
  let m: RegExpMatchArray | null;

  // Media keys
  // (A bare "stop" is left alone: it could mean "stop talking".)
  if (
    /^(?:pause|resume|play|unpause)(?: (?:music|song|video|track|playback|spotify))?$|^stop (?:music|song|video|playback|spotify)$/.test(
      t,
    )
  )
    return { action: 'media_control', target: 'play_pause' };
  if (/^(?:next|skip)(?: (?:song|track|video))?$|^skip (?:this|it)$/.test(t))
    return { action: 'media_control', target: 'next' };
  if (/^(?:previous|last|go back a) (?:song|track)$|^previous$/.test(t))
    return { action: 'media_control', target: 'previous' };

  // Research mode on/off (before "research <topic>")
  if (
    /^(?:turn |switch |put )?research(?: mode)? on$|^(?:turn|switch) on research(?: mode)?$|^enable research(?: mode)?$/.test(
      t,
    )
  )
    return { action: 'research_on' };
  if (
    /^(?:turn |switch )?research(?: mode)? off$|^(?:turn|switch) off research(?: mode)?$|^disable research(?: mode)?$/.test(
      t,
    )
  )
    return { action: 'research_off' };

  // Chats
  if (/^(?:start |open |begin |make )?(?:a )?new (?:chat|conversation)$/.test(t))
    return { action: 'new_chat' };
  if (/^(?:start |open |begin )?(?:a )?new research(?: chat)?$|^research mode$/.test(t))
    return { action: 'research' };
  if (
    (m = t.match(
      /^(?:do (?:some )?research (?:on|into|about)|research|look into|find out about) (.{3,})$/,
    ))
  )
    return { action: 'research', value: m[1] };
  if (/^export (?:this )?(?:chat|conversation)$/.test(t)) return { action: 'export_chat' };
  if (/^pin (?:this )?(?:chat|conversation)$/.test(t)) return { action: 'pin_chat' };
  if ((m = t.match(/^(?:rename|call) (?:this )?(?:chat|conversation) (?:to |as )?(.{1,60})$/)))
    return { action: 'rename_chat', value: m[1] };
  if (
    (m = t.match(/^(?:switch to|open|go to|go back to|show) (.{2,60}?) (?:chat|conversation)$/)) &&
    !/^(?:a )?new$/.test(m[1] ?? '')
  )
    return { action: 'switch_chat', value: m[1] };

  // Cleanup and gaming
  if (
    /^(?:free up|clear up|clean up|make|find)(?: some)? (?:space|room|disk space)(?: on (?:pc|computer|c|c drive|drive))?$|^clean up (?:pc|computer|disk|drive|c drive)$|^how much space can i (?:free|clear|save)$/.test(
      t,
    )
  )
    return { action: 'scan_space' };
  if (
    /^(?:start|turn on|enable|activate|switch on) gaming(?: mode)?$|^gaming mode on$|^game mode on$|^(?:start|turn on) game mode$/.test(
      t,
    )
  )
    return { action: 'gaming_on' };
  if (
    /^(?:stop|end|turn off|disable|exit|switch off) gaming(?: mode)?$|^gaming mode off$|^game mode off$|^(?:stop|turn off) game mode$/.test(
      t,
    )
  )
    return { action: 'gaming_off' };

  if (/^(?:turn |switch )?open mic(?:rophone)? on$|^(?:start|turn on) open mic$/.test(t))
    return { action: 'open_mic_on' };
  if (
    /^(?:turn |switch )?open mic(?:rophone)? off$|^(?:stop|turn off|end) open mic$|^(?:stop|that's all|that is all) listening$/.test(
      t,
    )
  )
    return { action: 'open_mic_off' };

  if (
    /^(?:turn |switch )?(?:on )?(?:whisper|quiet) mode(?: on)?$|^(?:start |turn on )?whisper(?:ing)?(?: mode)?$|^speak (?:quietly|softly)$|^be quiet(?:er)?$|^keep (?:it|your voice) down$/.test(
      t,
    )
  )
    return { action: 'whisper_on' };
  if (
    /^(?:turn |switch )?(?:off )?(?:whisper|quiet) mode(?: off)?$|^(?:stop|end) whisper(?:ing)?(?: mode)?$|^speak (?:normally|up|louder)$|^normal voice$/.test(
      t,
    ) &&
    !/on$/.test(t)
  )
    return { action: 'whisper_off' };

  // Settings and tabs: only ARC's own names, so "open spotify" still launches Spotify.
  if (
    (m = t.match(/^(?:open|show|go to|switch to|take me to|bring up|change) (?:(.+) )?settings$/))
  ) {
    const sub = m[1] ? SETTINGS_WORDS.find(([re]) => re.test(m?.[1] ?? ''))?.[1] : undefined;
    return { action: 'open_settings', ...(sub ? { value: sub } : {}) };
  }
  if ((m = t.match(/^(?:show me|open|show|go to|switch to|take me to|bring up|view) (.+)$/))) {
    const tab = tabFor(m[1] ?? '');
    if (tab) return { action: 'open_tab', value: tab };
  }
  return null;
}

export const isArcCommand = (c: ArcCommand | RawIntent): c is ArcCommand =>
  (ARC_ACTIONS as readonly string[]).includes(c.action);
