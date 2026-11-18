/** Command pipeline contracts:
 *  AI raw intent -> canonIntent() -> CanonicalCommand -> executor -> CommandResult. */
import type { RawIntent } from './types';

export const CANONICAL_ACTIONS = [
  'launch_app',
  'open_url',
  'search_web',
  'system_query',
  'unknown',
] as const;
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
  open_url: 'safe',
  search_web: 'safe',
  system_query: 'safe',
  unknown: 'sensitive',
};

export function toCommand(intent: RawIntent, id: string): CanonicalCommand {
  const action = canonIntent(intent.action);
  return { id, action, target: intent.target, risk: RISK[action], rawAction: intent.action };
}
