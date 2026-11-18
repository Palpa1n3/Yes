/** Plugin / skill contract. A skill claims canonical actions (and optionally phrases),
 *  runs in the main process, and may contribute a HUD widget for the right rail.
 *  Planned: media control, calendar brief, file search, window management, smart home,
 *  clipboard history. See README › "Adding a skill". */
import type { CanonicalAction, CanonicalCommand, CommandResult } from './commands';
import type { Settings, SystemStats } from './types';

/** What a skill may use. Grows as skills need more (kept small on purpose). */
export interface SkillContext {
  settings(): Settings;
  stats(): SystemStats;
  /** Open an http(s) URL in the default browser. */
  openUrl(url: string): Promise<void>;
  log(message: string): void;
}

export interface ArcSkill<Panel = unknown> {
  id: string;
  name: string;
  /** Phrases that route to this skill (matched by the router after canonIntent). */
  intents: string[];
  /** Canonical actions this skill handles. */
  actions: CanonicalAction[];
  /** Return null to decline a command, letting the next skill or the executor try. */
  handler(cmd: CanonicalCommand, ctx: SkillContext): Promise<CommandResult | null>;
  /** Optional custom HUD widget (renderer side), e.g. a React component. */
  panel?: Panel;
}
