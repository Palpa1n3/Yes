/** Command pipeline contracts:
 *  AI raw intent -> canonIntent() -> CanonicalCommand -> executor -> CommandResult. */
import type { RawIntent } from './types';

export const CANONICAL_ACTIONS = [
  'launch_app',
  'close_app',
  'open_url',
  'search_web',
  'system_query',
  'set_volume',
  'media_control',
  'open_folder',
  'find_files',
  'reveal_file',
  'set_timer',
  'cancel_timer',
  'lock_screen',
  'run_routine',
  'unknown',
] as const;

/** Fixed vocabularies for actions whose target is one of a few values. */
export const MEDIA_KEYS = ['play_pause', 'next', 'previous', 'stop'] as const;
export type MediaKey = (typeof MEDIA_KEYS)[number];
export type CanonicalAction = (typeof CANONICAL_ACTIONS)[number];

export type CommandRisk = 'safe' | 'sensitive' | 'destructive';

export interface CanonicalCommand {
  id: string;
  action: CanonicalAction;
  target?: string;
  args?: string[];
  risk: CommandRisk;
  /** The phrase the AI originally produced, kept for the activity log and debugging. */
  rawAction?: string;
}

export type CommandStatus = 'pending' | 'success' | 'failed';

export interface CommandResult {
  commandId: string;
  status: Exclude<CommandStatus, 'pending'>;
  message: string;
  timestamp: number;
}

/** Phrase variants per action. Stage 7 extends this table and its tests; anything
 *  unmatched becomes `unknown` so the router never silently drops a command. */
const SYNONYMS: Record<Exclude<CanonicalAction, 'unknown'>, string[]> = {
  launch_app: [
    'launch_app',
    'open app',
    'open application',
    'open program',
    'open the app',
    'launch',
    'launch app',
    'launch application',
    'launch program',
    'start',
    'start app',
    'start application',
    'start program',
    'run',
    'run app',
    'run application',
    'run program',
    'execute',
    'execute app',
    'fire up',
    'boot up',
    'load app',
    'app launch',
    'application launch',
    'open_app',
    'start_app',
    'run_app',
    'launchapp',
    'openapp',
  ],
  open_url: [
    'open_url',
    'open url',
    'open link',
    'open website',
    'open site',
    'open web page',
    'open webpage',
    'open page',
    'go to',
    'goto',
    'navigate',
    'navigate to',
    'browse',
    'browse to',
    'visit',
    'visit site',
    'load url',
    'open in browser',
    'browser open',
    'open_website',
    'navigate_url',
    'go_to_url',
  ],
  close_app: [
    'close_app',
    'close app',
    'close',
    'quit',
    'quit app',
    'exit app',
    'kill app',
    'stop app',
    'end task',
    'terminate app',
  ],
  set_volume: [
    'set_volume',
    'set volume',
    'volume',
    'change volume',
    'adjust volume',
    'mute',
    'unmute',
    'mute audio',
    'unmute audio',
  ],
  media_control: [
    'media_control',
    'media',
    'media key',
    'play pause',
    'pause music',
    'play music',
    'next track',
    'previous track',
    'skip track',
  ],
  open_folder: ['open_folder', 'open folder', 'show folder', 'browse folder', 'open directory'],
  find_files: [
    'find_files',
    'find files',
    'find file',
    'search files',
    'file search',
    'locate file',
    'look for file',
  ],
  reveal_file: ['reveal_file', 'reveal file', 'show file', 'show in folder', 'show in explorer'],
  set_timer: [
    'set_timer',
    'set timer',
    'timer',
    'start timer',
    'reminder',
    'set reminder',
    'remind me',
    'remind',
  ],
  cancel_timer: [
    'cancel_timer',
    'cancel timer',
    'stop timer',
    'delete timer',
    'cancel reminder',
    'clear timers',
    'cancel alarm',
    'stop alarm',
  ],
  run_routine: ['run_routine', 'run routine', 'start routine', 'routine', 'run_workflow'],
  lock_screen: [
    'lock_screen',
    'lock screen',
    'lock',
    'lock pc',
    'lock computer',
    'lock workstation',
  ],
  search_web: [
    'search_web',
    'search',
    'web search',
    'search web',
    'search the web',
    'search online',
    'internet search',
    'google',
    'google search',
    'bing',
    'look up',
    'lookup',
    'look up online',
    'find online',
    'search for',
    'web_search',
    'search_internet',
    'query web',
  ],
  system_query: [
    'system_query',
    'system info',
    'system information',
    'system status',
    'system check',
    'query system',
    'diagnostics',
    'run diagnostics',
    'check system',
    'system stats',
    'system health',
    'health check',
    'pc status',
    'computer status',
    'status report',
    'system_status',
    'get_system_info',
  ],
};

const normalise = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const LOOKUP = new Map<string, CanonicalAction>(
  Object.entries(SYNONYMS).flatMap(([action, phrases]) =>
    phrases.map((p) => [normalise(p), action as CanonicalAction] as const),
  ),
);

/** Map any AI-produced action phrase onto one internal action. */
export function canonIntent(action: string): CanonicalAction {
  return LOOKUP.get(normalise(action)) ?? 'unknown';
}

const RISK: Record<CanonicalAction, CommandRisk> = {
  launch_app: 'safe',
  // Closing can lose unsaved work, so it asks first unless the personality says "never ask".
  close_app: 'destructive',
  open_url: 'safe',
  search_web: 'safe',
  system_query: 'safe',
  set_volume: 'safe',
  media_control: 'safe',
  open_folder: 'safe',
  find_files: 'safe',
  reveal_file: 'safe',
  set_timer: 'safe',
  cancel_timer: 'safe',
  lock_screen: 'sensitive',
  // A routine may close apps or lock the PC; the user wrote it, but Claude asking for one shows a card.
  run_routine: 'sensitive',
  unknown: 'sensitive',
};

export function toCommand(intent: RawIntent, id: string): CanonicalCommand {
  const action = canonIntent(intent.action);
  return {
    id,
    action,
    target: intent.target,
    ...(intent.args?.length ? { args: intent.args } : {}),
    risk: RISK[action],
    rawAction: intent.action,
  };
}
