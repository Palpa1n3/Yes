/** Prompt-injection protection at the tool and permission level (safety gate 4).
 *  shared/injection.ts warns the AI about instructions hidden in outside content; this makes sure
 *  that content can't unlock risky actions, whatever the AI says:
 *  - Chat: once Alton has read outside content (emails, web pages, documents, the screen,
 *    messages…), risky tools (sending, posting, opening links, moving or deleting things, power,
 *    saving memories, schedules) need the user's Approve for that turn and the next two.
 *  - Agent Mode: a click on (or Enter on) a button labelled like Send, Pay, Buy, Delete, Submit,
 *    Install… needs the user's Approve unless they approved that step just before.
 *  The check runs in Alton's main process, not in the AI. Pure; tested in tests/tool-guard.test.ts. */
import { OUTSIDE_TOOLS } from './injection';

/** Tools (and Claude's own server tools) whose results come from outside. */
export const UNTRUSTED_TOOLS: Record<string, string> = {
  ...OUTSIDE_TOOLS,
  web_search: 'web search results',
  web_fetch: 'web page',
  look_at_screen: 'screen',
  look_at_all_screens: 'screen',
};

/** How many turns outside content keeps risky tools locked: the turn it was read, and two more. */
export const OUTSIDE_TURNS = 3;

const READ_ONLY = new Set([
  'diagnose',
  'recommend',
  'dependencies',
  'outdated',
  'load_order',
  'list',
  'status',
  'check',
  'scan',
  'check_updates',
  'profiles',
  'find',
]);

const field = (input: unknown, k: string): string => {
  const v = input && typeof input === 'object' ? (input as Record<string, unknown>)[k] : undefined;
  return typeof v === 'string' ? v : '';
};

/** What a risky tool call would do, in plain words; null when it isn't risky. */
export function riskyTool(name: string, input: unknown): string | null {
  switch (name) {
    case 'post_to_discord':
      return 'post a message to Discord';
    case 'reply_phone_message':
      return 'send a text message from your phone';
    case 'open_url':
      return `open a web link${field(input, 'url') ? ` (${field(input, 'url').slice(0, 120)})` : ''}`;
    case 'search_web':
      return 'open a web search';
    case 'power_pc':
      return field(input, 'action') === 'cancel' ? null : 'shut down, restart or sleep the PC';
    case 'download_mode':
    case 'steam_downloads':
    case 'when_steam_updates_finish':
      return 'set the PC to shut down or sleep later';
    case 'organize_folder':
      return 'move files into folders';
    case 'undo_organize':
      return 'move files back';
    case 'close_app':
      return 'close an app';
    case 'run_routine':
      return 'run a routine';
    case 'create_routine':
      return 'create a routine';
    case 'schedule_agent_task':
      return 'schedule an Agent Mode task';
    case 'start_background_research':
      return 'start paid background research';
    case 'remind_when_app_opens':
      return 'set a reminder';
    case 'remember':
      return 'save something to memory';
    case 'forget':
      return 'delete a memory';
    case 'shop':
      return field(input, 'goal') === 'find' ? null : 'make an offer or buy something';
    case 'minecraft_build':
      return field(input, 'action') === 'build' ? 'build in Minecraft' : null;
    case 'apply_self_change':
      return 'change its own code in your project';
    case 'dev_sandbox':
      return field(input, 'action') === 'check' ? 'run tests on its changed code' : null;
    case 'cyberpunk_mods':
    case 'minecraft_mods': {
      const a = field(input, 'action');
      return a && READ_ONLY.has(a)
        ? null
        : `change your ${name === 'cyberpunk_mods' ? 'Cyberpunk' : 'Minecraft'} mods`;
    }
    default:
      return null;
  }
}

/** Has outside content been read recently in this conversation? */
export class OutsideContent {
  private left = 0;
  private from = new Set<string>();

  /** A new user message. */
  newTurn(): void {
    if (this.left > 0 && --this.left === 0) this.from.clear();
  }

  /** A tool's result came from outside. */
  saw(tool: string): void {
    const source = UNTRUSTED_TOOLS[tool];
    if (!source) return;
    this.left = OUTSIDE_TURNS;
    this.from.add(source);
  }

  get active(): boolean {
    return this.left > 0;
  }

  sources(): string[] {
    return [...this.from];
  }

  reset(): void {
    this.left = 0;
    this.from.clear();
  }
}

/** The approval card for a risky tool after outside content. */
export function outsideApproval(
  what: string,
  sources: string[],
): { title: string; detail: string } {
  return {
    title: `Alton wants to ${what}`,
    detail: `Alton has just read content from outside (${sources.join(', ') || 'outside'}). To be safe, anything risky after that needs your OK, so instructions hidden in that content can't make Alton act. Approve only if you asked for this.`,
  };
}

/** The tool result when the user says no (or doesn't answer). */
export const DENIED_AFTER_OUTSIDE =
  "Not done: the user didn't approve it. Alton's safety rule: after reading outside content, risky actions need the user's OK. Tell the user what you wanted to do and why; don't try another way round.";

/* ── Agent Mode ───────────────────────────────────────────────────────────── */

const RISKY_LABEL =
  /\b(send|pay|pay now|buy|buy now|purchase|place (your )?order|checkout|check out|complete (order|purchase)|confirm( (order|purchase|payment))?|submit|delete|remove|erase|discard|transfer|post|publish|share|install|uninstall|unsubscribe|accept|agree|donate|bid|make offer|sign out|log out|reset)\b/i;

/** Control types a click lands on as a whole (a label inside a button belongs to the button). */
const CLICKABLE = /Button|Hyperlink|MenuItem|SplitButton|ListItem|TabItem|CheckBox/;

export interface UiPart {
  /** UI Automation control type, e.g. "ControlType.Button". */
  type: string;
  name: string;
}

/** What a click at a point would press: the nearest clickable element (the element itself or up
 *  to two parents), else the element's own name. */
export function clickTarget(parts: UiPart[]): UiPart | null {
  return parts.find((p) => CLICKABLE.test(p.type) && p.name.trim()) ?? parts[0] ?? null;
}

/** Is this a button that sends, pays, deletes, installs…? Returns its label, or null. */
export function riskyButton(target: UiPart | null): string | null {
  if (!target) return null;
  const name = target.name.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 80) return null;
  return RISKY_LABEL.test(name) ? name : null;
}

/** How long a confirm_action approval covers the click that follows. */
export const APPROVAL_COVERS_MS = 90_000;
export const APPROVAL_COVERS_ACTIONS = 4;
