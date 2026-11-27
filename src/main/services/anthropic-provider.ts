/** Claude via the Anthropic Messages API, with ARC's actions as tools.
 *  ARC runs the loop itself so each action passes through the renderer's command cards
 *  (Approve / Cancel, activity log) before its result goes back to the model. */
import { describeSchedule, describeStep, type Routine } from '@shared/routines';
import { guardToolResult } from '@shared/injection';
import { fmtTime, type CalEvent } from '@shared/calendar';
import type { Source } from '@shared/chats';
import type { NowPlaying } from '@shared/media';
import { ARC_ACTIONS } from '@shared/arcCommands';
import { attachmentBlocks } from '@shared/attachments';
import type { Frame } from './screen-watch';
import type { EmailService } from './email';
import { weatherSummary, type WeatherData } from '@shared/weather';
import Anthropic from '@anthropic-ai/sdk';
import type {
  AiModel,
  ProviderChunk,
  RawIntent,
  SystemInfo,
  SystemStats,
  ToolOutcome,
  TimerInfo,
} from '@shared/types';
import type { AIProvider, SendOptions } from './ai-provider';
import { EXTRA_TOOL_DEFS, EXTRA_TOOL_NAMES } from './extra-tool-defs';

type Msg = Anthropic.Beta.BetaMessageParam;
type ToolResult = Anthropic.Beta.BetaToolResultBlockParam;

/** Most model steps (tool calls) in one reply, so a confused turn can't run up a bill. */
export const MAX_STEPS = 8;
/** Start a fresh model context after this many messages (each restart is announced). */
export const MAX_TRANSCRIPT = 300;

export const MODEL_LABEL: Record<AiModel, string> = {
  'claude-haiku-5-5': 'Haiku 5.5',
  'claude-sonnet-5-5': 'Sonnet 5.5',
  'claude-opus-5-5': 'Opus 5.5',
};

/** What the console says while a local tool runs. */
const ACTIVITY_TEXT: Record<string, string> = {
  search_past_chats: 'Searching past chats…',
  read_arc_logs: 'Checking my own logs…',
  read_arc_source: 'Reading my own code…',
  create_routine: 'Making a routine…',
  get_recent_crashes: 'Reading the crash records…',
  list_installed_games: 'Looking for your games…',
  launch_game: 'Starting the game…',
  run_benchmark: 'Running a quick benchmark…',
  search_documents: 'Searching your files…',
  organize_folder: 'Planning the tidy-up…',
  get_optimization_tips: 'Checking the PC…',
  check_minecraft_mods: 'Checking your mods…',
  run_self_test: 'Running my tests…',
  start_background_research: 'Starting background research…',
  look_at_all_screens: 'Looking at all your screens…',
};

/** Thrown when the network is unreachable, so the caller can fall back to the mock. */
export class OfflineError extends Error {}

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'launch_app',
    description:
      "Open an application on the user's computer. Pass the app's name or a phrase from the user's app list (e.g. 'spotify', 'vs code', 'play music'). Call list_apps first if unsure of the name.",
    input_schema: {
      type: 'object',
      properties: { app: { type: 'string', description: 'App name or alias' } },
      required: ['app'],
      additionalProperties: false,
    },
  },
  {
    name: 'open_url',
    description: 'Open a web page in the default browser. Only http(s) addresses.',
    input_schema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_web',
    description:
      "Search the web in the user's default browser and show them the results page. Use when they ask to look something up online.",
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_system_status',
    description:
      'Read live system telemetry: CPU, memory, GPU, temperatures, disks, network, uptime, and (when available) top processes.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_apps',
    description: "List the apps in the user's app registry with the phrases that open them.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'close_app',
    description:
      'Politely ask a running app to close (like clicking its X), so it can still ask to save. The user is asked to approve first. Use the app name as the user would say it or as shown in get_system_status topProcesses (e.g. "opera", "spotify").',
    input_schema: {
      type: 'object',
      properties: { app: { type: 'string' } },
      required: ['app'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_volume',
    description:
      'Set the system output volume (0-100) and/or mute or unmute it. Give at least one of level or mute.',
    input_schema: {
      type: 'object',
      properties: {
        level: { type: 'integer', minimum: 0, maximum: 100 },
        mute: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'media_control',
    description: 'Press a media key for whatever is playing (Spotify, a browser video, etc.).',
    input_schema: {
      type: 'object',
      properties: { action: { type: 'string', enum: ['play_pause', 'next', 'previous', 'stop'] } },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'open_folder',
    description: "Open one of the user's folders in File Explorer.",
    input_schema: {
      type: 'object',
      properties: {
        folder: {
          type: 'string',
          enum: ['documents', 'downloads', 'desktop', 'pictures', 'videos', 'music'],
        },
      },
      required: ['folder'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_files',
    description:
      "Search file names in the user's Documents, Downloads, Desktop, Pictures, Videos and Music (newest first, up to 15). Use short distinctive words from the file name.",
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'reveal_file',
    description:
      'Show a file (by full path, e.g. from find_files) selected in File Explorer. It does not open or run the file.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_timer',
    description:
      'Set a timer or reminder. When it ends the user gets a Windows notification with the label.',
    input_schema: {
      type: 'object',
      properties: {
        minutes: { type: 'number', exclusiveMinimum: 0, maximum: 1440 },
        label: { type: 'string' },
        focus: {
          type: 'boolean',
          description:
            'A focus session ("focus for 30 minutes", "help me concentrate"): suggestions and alerts stay quiet until it ends.',
        },
      },
      required: ['minutes'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_timers',
    description: 'List running and ringing timers/reminders with their labels and time left.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'cancel_timer',
    description: 'Cancel timers whose label contains the given words, or "all".',
    input_schema: {
      type: 'object',
      properties: { which: { type: 'string' } },
      required: ['which'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_to_list',
    description:
      'Add items to one of the user\'s lists (shopping, to-do, packing…). The list is created if needed. Use "To-do" for tasks.',
    input_schema: {
      type: 'object',
      properties: { list: { type: 'string' }, items: { type: 'array', items: { type: 'string' } } },
      required: ['list', 'items'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_lists',
    description: "The user's lists with what is still to do and what is done.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'update_list_item',
    description:
      'Tick off ("done"), reopen ("undone") or remove an item from a list, matched by its words.',
    input_schema: {
      type: 'object',
      properties: {
        list: { type: 'string' },
        item: { type: 'string' },
        action: { type: 'string', enum: ['done', 'undone', 'remove'] },
      },
      required: ['item', 'action'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_note',
    description: 'Save a quick note for the user (shown in the Notes tab).',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_notes',
    description: "The user's saved notes, newest first.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'remember',
    description:
      'Remember a fact about the user for all future chats (preferences, people, dates, details they ask you to keep), or the fix for a problem you solved together (category "solutions") so you can reuse it next time. Use when they ask you to remember something, clearly want it kept, or a troubleshooting session ended with a working fix.',
    input_schema: {
      type: 'object',
      properties: {
        fact: { type: 'string' },
        category: {
          type: 'string',
          enum: ['about', 'people', 'preferences', 'work', 'solutions', 'apps', 'other'],
        },
        project: { type: 'string', description: 'Project name, if it belongs to one' },
      },
      required: ['fact'],
      additionalProperties: false,
    },
  },
  {
    name: 'manage_goal',
    description:
      "The user's long-term goals with progress (shown in the Notes tab and the morning briefing). list them, add one, update progress (0-100) with a short note of what was done, or remove one.",
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'update', 'remove'] },
        goal: { type: 'string', description: 'Goal title (or part of it)' },
        progress: { type: 'integer', minimum: 0, maximum: 100 },
        note: { type: 'string' },
        due: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'forget',
    description: 'Forget remembered facts matching these words.',
    input_schema: {
      type: 'object',
      properties: { about: { type: 'string' } },
      required: ['about'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_past_chats',
    description:
      'Search the user\'s earlier saved conversations with you (all chats, not just this one) for words or a topic. Use when they refer to something discussed before ("what was that recipe we talked about?", "remind me what you said about my router") or when earlier context would help. Returns matching excerpts with chat names and dates.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Key words to look for' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_routine',
    description:
      "Create (or replace, same name) a routine from the user's description: a named list of steps run in order, triggered by its phrases, a click in the Routines tab, at startup, or on a schedule. Step kinds and targets: launch_app (app name), close_app (app name), set_volume (0-100, mute or unmute), media_control (play_pause, next, previous, stop), open_folder (desktop, documents, downloads, pictures, music, videos), open_url (http(s) address), search_web (query), set_timer (minutes; label = what for), say (words to speak), briefing (no target), wait (seconds), lock_screen (no target). Only use when the user asks for a routine, shortcut phrase or scheduled automation. Tell them what you created.",
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short name, e.g. "Work mode"' },
        phrases: { type: 'array', items: { type: 'string' }, description: 'Phrases that run it' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string' },
              target: { type: 'string' },
              label: { type: 'string' },
            },
            required: ['kind'],
          },
        },
        runAtStartup: { type: 'boolean' },
        schedule: {
          type: 'object',
          description: 'Run automatically at a time on chosen days.',
          properties: {
            time: { type: 'string', description: '24-hour HH:MM' },
            days: {
              type: 'array',
              items: { type: 'integer', minimum: 0, maximum: 6 },
              description: '0 = Sunday',
            },
          },
          required: ['time', 'days'],
        },
      },
      required: ['name', 'steps'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_recent_crashes',
    description:
      "Windows' record of recent app crashes and hangs (with the faulting module and error code) and unexpected shutdowns or restarts. Use when the user says a game or app crashed, froze or the PC restarted by itself; explain the likely cause in plain words and suggest fixes (verify game files, update or roll back the graphics driver, disable overlays or recently added mods, check temperatures).",
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'integer', minimum: 1, maximum: 30 },
        app: { type: 'string', description: 'Only this app (e.g. "FortniteClient")' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_installed_games',
    description:
      'Games installed through Steam or the Epic Games Launcher on this PC (names, store, size).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'launch_game',
    description: 'Start an installed Steam or Epic game by name (through its launcher).',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_gaming_sessions',
    description:
      'Recent gaming sessions with performance: game, length, average/peak CPU and GPU load and temperatures, memory use. Use for questions about game performance, stutter, overheating or how long they played.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'read_arc_logs',
    description:
      "Your own (ARC's) recent error and warning log: crashes, failed actions, network or API errors. Use when the user says something in ARC isn't working, or asks you to debug yourself.",
    input_schema: {
      type: 'object',
      properties: { lines: { type: 'integer', minimum: 10, maximum: 300 } },
      additionalProperties: false,
    },
  },
  {
    name: 'read_arc_source',
    description:
      "Read your own (ARC's) source code, read-only, to explain how a feature works, find the cause of a bug or draft a fix for the user to apply. Without path: lists the files. With query: finds files and lines containing it. With path: returns that file (optionally a line range). It reads the copy of your code that ships with the app (or the user's project folder if they chose one in Settings › Advanced, which has their latest edits). You cannot change files; give the user the exact edit instead.",
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to the project, e.g. src/main/index.ts',
        },
        query: { type: 'string', description: 'Text to search for across the source' },
        from: { type: 'integer', minimum: 1 },
        to: { type: 'integer', minimum: 1 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'control_arc',
    description:
      "Control ARC's own interface: open a tab (value: overview, chat, notes, system, tasks, apps, network, storage, routines), open settings (value: optional section such as voice or gaming), start a new chat, start a research chat (value: optional topic), turn research mode on/off for this chat, switch to a saved chat (value: its name), export or pin this chat, rename it (value: new name), scan for disk space to free (the user then chooses in the Storage tab), or turn gaming mode on/off.",
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
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
          ],
        },
        value: { type: 'string' },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_emails',
    description:
      "The user's newest Gmail inbox messages (sender, subject, date, unread), plus the unread count. Read-only.",
    input_schema: {
      type: 'object',
      properties: { unreadOnly: { type: 'boolean' }, query: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'read_email',
    description:
      'The text of one email from get_emails (by its uid). Read-only: it is not marked as read.',
    input_schema: {
      type: 'object',
      properties: { uid: { type: 'number' } },
      required: ['uid'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_clipboard_history',
    description:
      'Text the user copied recently (newest first, passwords hidden), optionally only items containing some words. Use for "what did I copy", "paste that link again", etc.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'look_at_screen',
    description:
      "See what's on the user's screen right now (the app or game they're using, not ARC). Use whenever they refer to something they're looking at: an error, a setting, a page, a game menu, 'this', 'here', 'what should I pick'.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_now_playing',
    description:
      "What's playing right now in any media app (Spotify, a browser tab, etc.): title, artist, app, playing or paused.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_routines',
    description:
      'List the user\'s saved routines (named sequences of actions such as "Focus mode") with their steps.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'run_routine',
    description:
      "Run one of the user's saved routines by name. Use when they ask to start a routine or mode by name; call list_routines first if unsure of the exact name.",
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_calendar',
    description:
      "The user's upcoming calendar events (from yesterday to two weeks ahead) with local start/end times. Use for questions about their schedule, appointments, meetings or plans. This is read-only on the PC: to add, move or delete an event, tell the user to ask Alton in the phone app (it changes their calendar straight away), or give them a Google Calendar link to add one.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_weather',
    description:
      "Current weather and the forecast for the next few hours, today and tomorrow at the user's saved location, in their units. Use for questions about weather, rain, temperature, or whether to take a coat or umbrella.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'lock_screen',
    description: "Lock the user's computer (Windows lock screen).",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  ...EXTRA_TOOL_DEFS,
].map((t) => ({ ...t, eager_input_streaming: true }) as Anthropic.Beta.BetaTool);

/** Validate a (tolerantly parsed) tool input; returns the intent to run, or an error. */
export function toIntent(
  name: string,
  input: unknown,
):
  | { intent: RawIntent }
  | { error: string }
  | {
      local:
        | 'list_apps'
        | 'list_timers'
        | 'get_weather'
        | 'list_routines'
        | 'get_calendar'
        | 'notes'
        | 'get_now_playing'
        | 'look_at_screen'
        | 'get_clipboard_history'
        | 'email'
        | 'extra';
    } {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const str = (k: string): string | null =>
    typeof o[k] === 'string' && (o[k] as string).trim()
      ? (o[k] as string).trim().slice(0, 300)
      : null;
  if (EXTRA_TOOL_NAMES.has(name)) return { local: 'extra' };
  switch (name) {
    case 'launch_app': {
      const app = str('app');
      return app ? { intent: { action: 'launch_app', target: app } } : { error: 'Missing "app".' };
    }
    case 'open_url': {
      const url = str('url');
      return url ? { intent: { action: 'open_url', target: url } } : { error: 'Missing "url".' };
    }
    case 'search_web': {
      const q = str('query');
      return q ? { intent: { action: 'search_web', target: q } } : { error: 'Missing "query".' };
    }
    case 'get_system_status':
      return { intent: { action: 'system_query', target: 'overview' } };
    case 'list_apps':
      return { local: 'list_apps' };
    case 'close_app': {
      const app = str('app');
      return app ? { intent: { action: 'close_app', target: app } } : { error: 'Missing "app".' };
    }
    case 'set_volume': {
      const level =
        typeof o['level'] === 'number' && Number.isFinite(o['level'])
          ? Math.round(o['level'] as number)
          : undefined;
      const mute = typeof o['mute'] === 'boolean' ? (o['mute'] as boolean) : undefined;
      if (level === undefined && mute === undefined)
        return { error: 'Give "level" (0-100) and/or "mute".' };
      if (level !== undefined && (level < 0 || level > 100))
        return { error: '"level" must be 0-100.' };
      return {
        intent: {
          action: 'set_volume',
          target: level === undefined ? '' : String(level),
          ...(mute === undefined ? {} : { args: [mute ? 'mute' : 'unmute'] }),
        },
      };
    }
    case 'media_control': {
      const a = str('action');
      return a && ['play_pause', 'next', 'previous', 'stop'].includes(a)
        ? { intent: { action: 'media_control', target: a } }
        : { error: '"action" must be play_pause, next, previous or stop.' };
    }
    case 'open_folder': {
      const f = str('folder')?.toLowerCase();
      return f ? { intent: { action: 'open_folder', target: f } } : { error: 'Missing "folder".' };
    }
    case 'find_files': {
      const q = str('query');
      return q ? { intent: { action: 'find_files', target: q } } : { error: 'Missing "query".' };
    }
    case 'reveal_file': {
      const p = str('path');
      return p ? { intent: { action: 'reveal_file', target: p } } : { error: 'Missing "path".' };
    }
    case 'set_timer': {
      const m =
        typeof o['minutes'] === 'number' && Number.isFinite(o['minutes'])
          ? (o['minutes'] as number)
          : NaN;
      if (!(m > 0 && m <= 1440)) return { error: '"minutes" must be between 0 and 1440.' };
      const label = str('label');
      if (o['focus'] === true)
        return {
          intent: {
            action: 'set_timer',
            target: String(m),
            args: [label || 'Focus session', 'focus'],
          },
        };
      return {
        intent: { action: 'set_timer', target: String(m), ...(label ? { args: [label] } : {}) },
      };
    }
    case 'list_timers':
      return { local: 'list_timers' };
    case 'get_weather':
      return { local: 'get_weather' };
    case 'list_routines':
      return { local: 'list_routines' };
    case 'get_calendar':
      return { local: 'get_calendar' };
    case 'get_now_playing':
      return { local: 'get_now_playing' };
    case 'look_at_screen':
      return { local: 'look_at_screen' };
    case 'get_clipboard_history':
      return { local: 'get_clipboard_history' };
    case 'get_emails':
    case 'read_email':
      return { local: 'email' };
    case 'control_arc': {
      const action = str('action');
      if (!action || !(ARC_ACTIONS as readonly string[]).includes(action))
        return { error: '"action" must be one of the listed actions.' };
      const value = str('value');
      return {
        intent: { action: 'arc_control', target: action, ...(value ? { args: [value] } : {}) },
      };
    }
    case 'add_to_list':
    case 'get_lists':
    case 'update_list_item':
    case 'add_note':
    case 'get_notes':
    case 'remember':
    case 'forget':
    case 'manage_goal':
      return { local: 'notes' };
    case 'search_past_chats':
    case 'create_routine':
    case 'get_recent_crashes':
    case 'list_installed_games':
    case 'launch_game':
    case 'get_gaming_sessions':
    case 'read_arc_logs':
    case 'read_arc_source':
      return { local: 'extra' };
    case 'run_routine': {
      const n = str('name');
      return n ? { intent: { action: 'run_routine', target: n } } : { error: 'Missing "name".' };
    }
    case 'cancel_timer': {
      const w = str('which');
      return w ? { intent: { action: 'cancel_timer', target: w } } : { error: 'Missing "which".' };
    }
    case 'lock_screen':
      return { intent: { action: 'lock_screen' } };
    default:
      return { error: `Unknown tool "${name}".` };
  }
}

/** Compact telemetry for the model (bytes → GB, rounded), so tool results stay small. */
const RESEARCH_NOTE =
  "Research mode is on for this chat. Give thorough, well-organised answers in Markdown (short headings, bullet lists, bold for key points, tables when comparing). Search the web for anything current, factual or specific that you are not certain of, read the most relevant pages, and cite sources inline as Markdown links. Say clearly when sources disagree or information may be out of date. When recommending products, compare them in a table with approximate prices, and link each product to a page where it can be bought or reviewed (for example Amazon UK or the maker's site); ARC shows those links as picture cards under your answer.";

/** Web search and fetch (server tools). Newer models get the versions that filter
 *  results before they reach the context; Haiku uses the basic versions. */
export function webTools(model: AiModel, uses = 5): Anthropic.Beta.BetaToolUnion[] {
  return model === 'claude-haiku-5-5'
    ? [
        { type: 'web_search_20250305', name: 'web_search', max_uses: uses },
        { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: uses },
      ]
    : [
        { type: 'web_search_20260209', name: 'web_search', max_uses: uses },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: uses },
      ];
}

/** Unique pages cited (or found) in the assistant turns of this exchange. */
export function sourcesFrom(msgs: Msg[]): Source[] {
  const out = new Map<string, Source>();
  for (const m of msgs) {
    if (m.role !== 'assistant' || typeof m.content === 'string') continue;
    for (const b of m.content) {
      if (b.type === 'text' && Array.isArray(b.citations))
        for (const c of b.citations)
          if ('url' in c && typeof c.url === 'string' && !out.has(c.url))
            out.set(c.url, { url: c.url, title: ('title' in c && c.title) || c.url });
    }
  }
  return [...out.values()].slice(0, 12);
}

/** Calendar events as local, human-readable times for the model. */
export function calendarForModel(events: CalEvent[], now = Date.now()): Record<string, unknown> {
  const day = (t: number): string =>
    new Date(t).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  return {
    now: localTimeText(new Date(now)),
    events: events
      .filter((e) => e.end > now - 12 * 3600_000)
      .slice(0, 60)
      .map((e) => ({
        title: e.title,
        day: day(e.start),
        ...(e.allDay ? { allDay: true } : { start: fmtTime(e.start), end: fmtTime(e.end) }),
        ...(e.location ? { location: e.location } : {}),
        ...(e.end <= now ? { finished: true } : e.start <= now ? { happeningNow: true } : {}),
      })),
  };
}

/** "Wednesday 18 November 2026, 20:37 (Europe/London)": the user's local clock. */
export function localTimeText(now = new Date()): string {
  const date = now.toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
}

export function statsForModel(s: SystemStats): Record<string, unknown> {
  const gb = (b: number | null | undefined): number | null =>
    b == null ? null : Math.round((b / 1024 ** 3) * 10) / 10;
  return {
    localTime: localTimeText(new Date(s.timestamp || Date.now())),
    cpu: {
      loadPct: Math.round(s.cpu.load),
      threads: s.cpu.cores.length,
      ghz: s.cpu.speedGHz || null,
      tempC: s.cpu.temp,
    },
    memoryGB: { used: gb(s.memory.used), total: gb(s.memory.total) },
    gpu: s.gpu
      ? {
          name: s.gpu.name,
          loadPct: s.gpu.load,
          vramUsedGB: gb(s.gpu.memUsed),
          vramTotalGB: gb(s.gpu.memTotal),
          tempC: s.gpu.temp,
        }
      : null,
    disks: s.disks.map((d) => ({
      drive: d.mount,
      label: d.label,
      freeGB: gb(d.size - d.used),
      totalGB: gb(d.size),
    })),
    network: {
      downMBps: Math.round((s.network.down / 1024 ** 2) * 100) / 100,
      upMBps: Math.round((s.network.up / 1024 ** 2) * 100) / 100,
      pingMs: s.network.latencyMs,
      adapter: s.network.iface,
      wifi: s.network.ssid,
    },
    topProcesses: s.processes.slice(0, 5).map((p) => ({
      name: p.name,
      cpuPct: Math.round(p.cpu),
      memGB: gb(p.mem),
      ...(p.count && p.count > 1 ? { processes: p.count } : {}),
    })),
    battery: s.battery,
    uptimeHours: Math.round(s.uptime / 360) / 10,
  };
}

export interface AnthropicDeps {
  getKey(): Promise<string | null>;
  model(): AiModel;
  /** Model for research-mode chats. */
  researchModel?(): AiModel;
  /** Saver mode: fewer web searches per answer. */
  saver?(): boolean;
  /** The user's accent, if they set it (speech-recognition slips are likely). */
  accent?(): string;
  systemPrompt(): string;
  info(): SystemInfo | null;
  stats(): SystemStats;
  /** Fuller stats including top processes, read on demand for get_system_status. */
  detailedStats?(): Promise<SystemStats & { processesTimedOut?: boolean }>;
  /** Called when a turn starts, to pre-fetch slow data the model may ask for. */
  warm?(): void;
  apps(): Array<{ name: string; intents: string[] }>;
  timers?(): TimerInfo[];
  weather?(): WeatherData | null;
  routines?(): Routine[];
  /** Lists, notes and memories (the note tools). */
  notes?: { tool(name: string, input: unknown): unknown };
  memories?(): string[];
  nowPlaying?(): NowPlaying | null;
  clipboard?(query?: string): Array<{ copied: string; text: string }>;
  email?: Pick<EmailService, 'get' | 'read'>;
  screenshot?(): Promise<{ frame: Frame; ageSec: number; arcVisible: boolean } | null>;
  /** null = no calendar connected. */
  calendar?(): CalEvent[] | null;
  /** What the user is doing right now (app in front, gaming…), added to each turn. */
  context?(): string;
  /** search_past_chats, read_arc_logs, read_arc_source. */
  extra?: Partial<Record<string, (input: unknown) => unknown>>;
  /** Spending: every finished request with its token counts. */
  onUsage?(model: string, usage: import('@shared/usage').Usage, feature: string): void;
  /** A tool brought back outside content that looks like instructions to an AI. */
  onInjection?(tool: string, flags: string[]): void;
  /** Injectable for tests. */
  createClient?(apiKey: string): Pick<Anthropic, 'beta' | 'models'>;
}

export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic';
  private transcript: Msg[] = [];
  /** The top-level system prompt, fixed for the life of a conversation: Claude's earlier
   *  thinking is only valid while it stays byte-identical. Later changes are appended. */
  private system: string | null = null;
  /** The instructions most recently given (frozen ones, or the last appended update). */
  private lastSystem: string | null = null;

  constructor(private readonly deps: AnthropicDeps) {}

  /** Start from an earlier saved chat (plain text turns), e.g. after ARC restarts. */
  seed(history: Array<{ role: 'user' | 'assistant'; content: string }>): void {
    if (this.transcript.length) return;
    const out: Msg[] = [];
    for (const h of history.slice(-40)) {
      const text = h.content.trim();
      if (!text) continue;
      const last = out.at(-1);
      if (last && last.role === h.role && typeof last.content === 'string')
        last.content = `${last.content}\n\n${text}`;
      else out.push({ role: h.role, content: text });
    }
    while (out[0] && out[0].role !== 'user') out.shift();
    while (out.length && out.at(-1)?.role !== 'assistant') out.pop();
    this.transcript = out;
  }

  reset(): void {
    this.transcript = [];
    this.system = null;
    this.lastSystem = null;
  }

  private client(key: string): Pick<Anthropic, 'beta' | 'models'> {
    return this.deps.createClient?.(key) ?? new Anthropic({ apiKey: key, maxRetries: 2 });
  }

  /** Check a key and model without spending credit (Models API). */
  async test(key?: string): Promise<{ ok: boolean; message: string }> {
    const k = key ?? (await this.deps.getKey());
    if (!k) return { ok: false, message: 'No API key saved.' };
    try {
      const m = await this.client(k).models.retrieve(this.deps.model());
      return {
        ok: true,
        message: `Connected. ${m.display_name ?? MODEL_LABEL[this.deps.model()]} is ready.`,
      };
    } catch (err) {
      return { ok: false, message: describeError(err) };
    }
  }

  /** Live stats for get_system_status, with processes when they arrive in time. */
  private async statusForModel(): Promise<Record<string, unknown>> {
    const s = (await this.deps.detailedStats?.()) ?? this.deps.stats();
    const out = statsForModel(s);
    if ('processesTimedOut' in s && s.processesTimedOut)
      out['topProcesses'] =
        'unavailable: Windows took too long to list processes; suggest Task Manager (Ctrl+Shift+Esc) if needed';
    return out;
  }

  private systemText(): string {
    const memories = this.deps.memories?.() ?? [];
    const info = this.deps.info();
    const machine = info
      ? `The computer is "${info.hostname}" running ${info.osName} on ${info.cpuModel} (${info.cpuThreads} threads), ${Math.round(info.memTotal / 1024 ** 3)} GB RAM.`
      : '';
    const rules = [
      "You live inside ARC, a desktop assistant HUD on the user's own computer. Replies appear in a small console (and may be read aloud), so write plain sentences: no markdown headings, tables or code fences unless asked.",
      'Use the tools to act rather than describing what you would do. Actions may need the user to approve them; if one is cancelled or fails, say so briefly and suggest an alternative.',
      'Answer questions about the computer from get_system_status, never from guesses.',
      "You can see the user's screen with look_at_screen: use it whenever they mention something they're looking at, instead of asking them to describe it.",
      'You can also control ARC itself with control_arc: open its tabs and settings, start new or research chats, switch chats, scan for disk space and toggle gaming mode.',
      "Each user message is followed by a system note with the user's current local date and time, read from this computer's clock. It is accurate: answer questions about the time, date or day directly from it.",
      "You can also close apps, set the volume, control media playback, open folders, find files by name, show a file in Explorer, set, list and cancel timers/reminders, check the weather and the user's calendar, run their saved routines, keep lists and notes, remember things they ask you to, and lock the PC.",
      "Read the user's mood from their words and adapt: brief and calm when they're stressed or frustrated, playful when they joke (match their humour; light sarcasm only when they're clearly joking around), warm when something good happens.",
      'When you act, say briefly why you chose that action (one short clause), so your decisions are easy to follow.',
      `Messages may come from speech recognition${this.deps.accent?.() ? ` and the user has a ${this.deps.accent()} accent` : ''}, so words can be misheard (e.g. "beat one out" for something else, place names spelt wrongly). Work out what they most likely meant from context and act on that; if it could mean different things, ask a short question instead of guessing wildly. Don't comment on the mistakes.`,
      'Never say you have done something (turned a mode off, sent, saved, set, closed…) unless you called the tool for it in this turn and it succeeded. If you have not done it yet, do it now with the tool, or say plainly that you have not.',
      'When a problem gets solved, remember the fix with remember (category "solutions") so you can reuse it; check memories for earlier fixes before troubleshooting from scratch. For ongoing projects, remember details with the project name.',
      'There is a Notes list called "Alton roadmap" with the features the user wants. Whenever the user wishes you could do something ("I wish…", "it would be good if…", "can you add…", "you should be able to…"), a request fails because you lack a feature, or you notice an improvement that would clearly help them, add a short, specific idea to "Alton roadmap" with add_to_list straight away (one line: what and why; check get_lists first so you don\'t add duplicates) and mention it in one short clause. When the user says a roadmap item is done, tick it off. If asked how to improve yourself, research it and add concrete ideas.',
      'Have a point of view: when asked what you think or which option is better, give a clear recommendation and why, not a neutral list.',
      "Own your mistakes: if an action failed or you got something wrong, say so plainly, say what you'll do differently, and try another way. Be honest about what you can't do (you can't see other monitors' content unless shown, can't hear tone of voice, can't edit your own code) and suggest the closest thing you can do.",
      'Be curious about the user, lightly: now and then, when it fits naturally and the conversation is relaxed, ask one short question that helps you know them better (never during urgent tasks, never more than once in a while).',
      'You remember earlier conversations: when the user refers to something discussed before, use search_past_chats rather than saying you cannot recall.',
      "If the user reports that ARC itself is misbehaving, debug yourself: read_arc_logs for recent errors, and read_arc_source (read-only) to find the cause in your own code. Explain the problem simply and, if useful, give the exact change for them to make; you can't edit files yourself.",
      'For multi-step jobs on the PC that your tools cannot do (clicking through apps or websites), tell the user they can say "handle this for me" to switch on Agent Mode, where you use the mouse and keyboard.',
      machine,
      memories.length
        ? `Things you know about the user (they told you, or you noticed in earlier chats; use them naturally when relevant):\n${memories.map((m) => `- ${m}`).join('\n')}`
        : '',
    ];
    return `${this.deps.systemPrompt()}\n\n${rules.filter(Boolean).join('\n')}`;
  }

  async *send(
    messages: Parameters<AIProvider['send']>[0],
    opts: SendOptions,
  ): AsyncIterable<ProviderChunk> {
    const key = await this.deps.getKey();
    if (!key) throw new Error('No API key saved. Add one in Settings › AI.');
    const client = this.client(key);
    const research = opts.research === true;
    const model = research
      ? (this.deps.researchModel?.() ?? 'claude-sonnet-5-5')
      : this.deps.model();
    const userText = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

    if (this.transcript.length > MAX_TRANSCRIPT) {
      this.reset();
      yield {
        type: 'notice',
        message: 'This conversation got long, so I started a fresh context for the AI.',
      };
    }
    this.deps.warm?.();
    // Defensive: never send a history the API would reject (e.g. a tool call with no result).
    this.transcript = repairTranscript(this.transcript);
    const start = this.transcript.length;
    /** Set once the turn left the transcript complete; otherwise it's rolled back below. */
    let finished = false;
    const now = new Date();
    // Instructions (personality, name, machine details) can change mid-conversation.
    // Rewriting the top-level system prompt would invalidate Claude's earlier thinking,
    // so the change is appended at this point instead, where it becomes true.
    const current = this.systemText();
    if (this.transcript.length === 0 || this.system === null) {
      this.system = current;
      this.lastSystem = current;
    }
    const changed = current !== this.lastSystem;
    this.lastSystem = current;
    // Per-turn context as a mid-conversation system message keeps the cached prefix intact.
    this.transcript.push(
      opts.attachments?.length
        ? {
            role: 'user',
            content: [
              ...(attachmentBlocks(
                opts.attachments,
              ) as unknown as Anthropic.Beta.BetaContentBlockParam[]),
              { type: 'text', text: userText },
            ],
          }
        : { role: 'user', content: userText },
      {
        role: 'system',
        content: [
          `Current local date and time (from this computer's clock): ${localTimeText(now)}.`,
          this.deps.context?.() ?? '',
          research ? RESEARCH_NOTE : '',
          changed
            ? `Your instructions have been updated. From now on, follow these instead of the earlier ones:\n\n${current}`
            : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    );
    const system = this.system;
    let strippedThinking = false;

    try {
      let jsonRetries = 0;
      for (let step = 0; step < MAX_STEPS; step++) {
        const usesFallback = model !== 'claude-haiku-5-5'; // Haiku has no server-side fallback
        let message: Anthropic.Beta.BetaMessage;
        try {
          const stream = client.beta.messages.stream(
            {
              model,
              max_tokens: 64000,
              // Stable text, cached: the same for every request in this conversation.
              system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
              tools: research ? [...TOOLS, ...webTools(model, this.deps.saver?.() ? 2 : 5)] : TOOLS,
              // A snapshot: retries must not see messages appended later in this turn.
              messages: [...this.transcript],
              // Conversational route: low effort keeps replies quick and cheap.
              output_config: { effort: research ? 'medium' : 'low' },
              // If earlier thinking no longer matches the history, drop it rather than fail.
              thinking: {
                type: 'adaptive',
                block_binding: { prefix_mismatch_behavior: 'drop_block' },
              },
              betas: [
                'thinking-binding-controls-2026-08-01',
                ...(usesFallback ? ['server-side-fallback-2026-07-01'] : []),
              ],
              ...(usesFallback ? { fallbacks: 'default' as const } : {}),
            },
            { signal: opts.signal },
          );

          for await (const ev of stream) {
            if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta')
              yield { type: 'text', delta: ev.delta.text };
            else if (
              ev.type === 'content_block_start' &&
              ev.content_block.type === 'server_tool_use'
            )
              yield {
                type: 'activity',
                text:
                  ev.content_block.name === 'web_fetch'
                    ? 'Reading a web page…'
                    : 'Searching the web…',
              };
          }
          message = await stream.finalMessage();
          this.deps.onUsage?.(model, message.usage, research ? 'research' : 'chat');
          jsonRetries = 0;
        } catch (err) {
          if (opts.signal?.aborted) throw err;
          // Last resort for stale thinking: remove it all and retry this request once.
          if (
            err instanceof Anthropic.BadRequestError &&
            !strippedThinking &&
            isStaleThinking(err)
          ) {
            strippedThinking = true;
            this.transcript = stripThinking(this.transcript);
            continue;
          }
          // Unparseable streamed tool input: re-issue the turn (API errors are rethrown).
          if (
            !(err instanceof Anthropic.APIError) &&
            !(err instanceof Anthropic.APIConnectionError) &&
            jsonRetries++ < 2
          )
            continue;
          throw err;
        }

        if (message.stop_reason === 'refusal') {
          this.transcript.length = start; // drop the declined turn
          yield {
            type: 'error',
            message: 'Claude declined to answer that one. Try rephrasing, or ask something else.',
          };
          return;
        }
        if (message.stop_reason === 'pause_turn') {
          this.transcript.push({ role: 'assistant', content: message.content });
          continue;
        }
        const toolUses = message.content.filter(
          (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
        );
        if (toolUses.length === 0) {
          this.transcript.push({ role: 'assistant', content: message.content });
          finished = true;
          const sources = sourcesFrom(this.transcript.slice(start));
          if (sources.length) yield { type: 'sources', sources };
          yield { type: 'done' };
          return;
        }
        if (message.stop_reason === 'max_tokens') {
          this.transcript.length = start;
          yield {
            type: 'error',
            message: 'That reply ran too long to finish. Try asking for something smaller.',
          };
          return;
        }

        this.transcript.push({ role: 'assistant', content: message.content });
        const results: ToolResult[] = [];
        for (const t of toolUses) {
          const plan = toIntent(t.name, t.input);
          if ('error' in plan) {
            results.push({
              type: 'tool_result',
              tool_use_id: t.id,
              is_error: true,
              content: plan.error,
            });
            continue;
          }
          if ('local' in plan && plan.local === 'email') {
            const svc = this.deps.email;
            const o = (t.input && typeof t.input === 'object' ? t.input : {}) as Record<
              string,
              unknown
            >;
            let r: unknown;
            if (!svc || !svc.get().configured)
              r = {
                error:
                  'Email is not connected. The user can add Gmail in Settings › Connections › Email.',
              };
            else if (t.name === 'read_email') r = await svc.read(Number(o['uid']));
            else {
              const st = svc.get();
              const q = typeof o['query'] === 'string' ? o['query'].toLowerCase() : '';
              r = st.error
                ? { error: st.error }
                : {
                    unread: st.unread,
                    emails: st.recent
                      .filter((e) => !o['unreadOnly'] || e.unread)
                      .filter((e) => !q || `${e.from} ${e.subject}`.toLowerCase().includes(q))
                      .map((e) => ({
                        uid: e.uid,
                        from: e.from,
                        subject: e.subject,
                        received: new Date(e.date).toLocaleString(),
                        unread: e.unread,
                      })),
                  };
            }
            const isErr = !!r && typeof r === 'object' && 'error' in r;
            results.push({
              type: 'tool_result',
              tool_use_id: t.id,
              ...(isErr ? { is_error: true } : {}),
              content: JSON.stringify(r),
            });
            continue;
          }
          if ('local' in plan && plan.local === 'get_clipboard_history') {
            const q =
              t.input && typeof t.input === 'object'
                ? (t.input as { query?: unknown }).query
                : undefined;
            results.push({
              type: 'tool_result',
              tool_use_id: t.id,
              content: JSON.stringify(
                this.deps.clipboard?.(typeof q === 'string' ? q : '') ?? {
                  error: 'Clipboard history is off.',
                },
              ),
            });
            continue;
          }
          if ('local' in plan && plan.local === 'look_at_screen') {
            yield { type: 'activity', text: 'Looking at your screen…' };
            const shot = (await this.deps.screenshot?.()) ?? null;
            results.push(
              shot
                ? {
                    type: 'tool_result',
                    tool_use_id: t.id,
                    content: [
                      {
                        type: 'text',
                        text: `The user's screen (${shot.frame.width}×${shot.frame.height}), captured ${shot.ageSec ? `${shot.ageSec} seconds ago` : 'just now'}${shot.arcVisible ? '; ARC may be covering part of it' : ''}.`,
                      },
                      {
                        type: 'image',
                        source: {
                          type: 'base64',
                          media_type: 'image/jpeg',
                          data: shot.frame.jpeg.toString('base64'),
                        },
                      },
                    ],
                  }
                : {
                    type: 'tool_result',
                    tool_use_id: t.id,
                    is_error: true,
                    content:
                      'Screen awareness is off (Settings › Smart features) or the screen could not be captured.',
                  },
            );
            continue;
          }
          if ('local' in plan && plan.local === 'get_now_playing') {
            const n = this.deps.nowPlaying?.() ?? null;
            results.push({
              type: 'tool_result',
              tool_use_id: t.id,
              content: JSON.stringify(n ?? { nothingPlaying: true }),
            });
            continue;
          }
          if ('local' in plan && plan.local === 'extra') {
            const fn = this.deps.extra?.[t.name];
            yield { type: 'activity', text: ACTIVITY_TEXT[t.name] ?? 'Working on it…' };
            let r: unknown;
            try {
              r = fn ? await fn(t.input) : { error: 'That is not available right now.' };
            } catch (err) {
              r = { error: err instanceof Error ? err.message : String(err) };
            }
            const isErr = !!r && typeof r === 'object' && 'error' in r;
            // Tools may return pictures: { images: [{ label, jpeg (base64) }] }.
            const images =
              r && typeof r === 'object' && Array.isArray((r as { images?: unknown }).images)
                ? (r as { images: Array<{ label: string; jpeg: string }> }).images
                : null;
            results.push({
              type: 'tool_result',
              tool_use_id: t.id,
              ...(isErr ? { is_error: true } : {}),
              content: images
                ? images.flatMap((im) => [
                    { type: 'text' as const, text: im.label },
                    {
                      type: 'image' as const,
                      source: {
                        type: 'base64' as const,
                        media_type: 'image/jpeg' as const,
                        data: im.jpeg,
                      },
                    },
                  ])
                : typeof r === 'string'
                  ? r
                  : JSON.stringify(r),
            });
            continue;
          }
          if ('local' in plan && plan.local === 'notes') {
            const r = this.deps.notes?.tool(t.name, t.input) ?? { error: 'Notes are unavailable.' };
            const isErr = !!r && typeof r === 'object' && 'error' in r;
            results.push({
              type: 'tool_result',
              tool_use_id: t.id,
              ...(isErr ? { is_error: true } : {}),
              content: JSON.stringify(r),
            });
            continue;
          }
          if ('local' in plan && plan.local === 'get_calendar') {
            const events = this.deps.calendar?.() ?? null;
            results.push({
              type: 'tool_result',
              tool_use_id: t.id,
              ...(events
                ? { content: JSON.stringify(calendarForModel(events)) }
                : {
                    is_error: true,
                    content:
                      'No calendar is connected. The user can add their Google Calendar in Settings › Connections › Calendar.',
                  }),
            });
            continue;
          }
          if ('local' in plan) {
            const w = plan.local === 'get_weather' ? (this.deps.weather?.() ?? null) : null;
            if (plan.local === 'get_weather' && !w) {
              results.push({
                type: 'tool_result',
                tool_use_id: t.id,
                is_error: true,
                content:
                  'No weather available: the user has not set a location (Settings › General › Weather), or the forecast could not be fetched yet.',
              });
              continue;
            }
            results.push({
              type: 'tool_result',
              tool_use_id: t.id,
              content: JSON.stringify(
                w
                  ? weatherSummary(w)
                  : plan.local === 'list_routines'
                    ? (this.deps.routines?.() ?? []).map((r) => ({
                        name: r.name,
                        phrases: r.phrases,
                        steps: r.steps.map(describeStep),
                        schedule: r.schedule ? describeSchedule(r.schedule) : null,
                      }))
                    : plan.local === 'list_apps'
                      ? this.deps.apps()
                      : (this.deps.timers?.() ?? []).map((x) => ({
                          label: x.label || '(no label)',
                          status: x.status,
                          minutesLeft: Math.max(0, Math.round((x.dueAt - Date.now()) / 6000) / 10),
                          due: new Date(x.dueAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          }),
                        })),
              ),
            });
            continue;
          }
          // Show the action in ARC (card, approval, activity log) and wait for its outcome.
          yield { type: 'intent', intent: plan.intent, toolUseId: t.id };
          const outcome: ToolOutcome = opts.runTool
            ? await opts.runTool(t.id, plan.intent)
            : { status: 'failed', message: 'Actions are unavailable.' };
          if (opts.signal?.aborted) return;
          const content =
            plan.intent.action === 'system_query' && outcome.status === 'success'
              ? JSON.stringify(await this.statusForModel())
              : `${outcome.status}: ${outcome.message}`;
          results.push({
            type: 'tool_result',
            tool_use_id: t.id,
            content,
            is_error: outcome.status === 'failed',
          });
        }
        // Outside content (emails, documents, clipboard, messages…) is checked for hidden
        // instructions before Claude reads it; anything found gets a warning in front.
        for (const r of results) {
          if (typeof r.content !== 'string') continue;
          const name = toolUses.find((u) => u.id === r.tool_use_id)?.name ?? '';
          const g = guardToolResult(name, r.content);
          r.content = g.content;
          if (g.flags.length) this.deps.onInjection?.(name, g.flags);
        }
        this.transcript.push({ role: 'user', content: results });
      }
      // Ran out of steps: close the turn cleanly.
      this.transcript.push({
        role: 'assistant',
        content: 'I stopped there to avoid running too many steps in one go.',
      });
      finished = true;
      yield {
        type: 'text',
        delta: ' (I stopped there to avoid running too many steps in one go.)',
      };
      yield { type: 'done' };
    } catch (err) {
      // Leave the transcript as it was before this turn so the next one is valid.
      this.transcript.length = start;
      if (opts.signal?.aborted || err instanceof Anthropic.APIUserAbortError) return;
      if (
        err instanceof Anthropic.APIConnectionError &&
        !(err instanceof Anthropic.APIConnectionTimeoutError)
      )
        throw new OfflineError(describeError(err), { cause: err });
      throw new Error(describeError(err), { cause: err });
    } finally {
      // Covers early exits the catch doesn't see: an abort while waiting on an action,
      // or the caller stopping iteration. A half-finished turn must not stay in history.
      if (!finished) this.transcript.length = start;
    }
  }
}

/** Drop anything from the first broken spot onward: an assistant tool call not answered
 *  by tool results in the next message, or a mid-conversation system message that isn't
 *  last or followed by the assistant. Returns the input unchanged when it's valid. */
export function repairTranscript(msgs: Msg[]): Msg[] {
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i] as Msg;
    const next = msgs[i + 1];
    if (m.role === 'system' && next && next.role !== 'assistant') return msgs.slice(0, i);
    if (m.role !== 'assistant' || typeof m.content === 'string') continue;
    const ids = m.content.flatMap((b) => (b.type === 'tool_use' ? [b.id] : []));
    if (ids.length === 0) continue;
    const answered =
      next?.role === 'user' && Array.isArray(next.content)
        ? new Set(next.content.flatMap((b) => (b.type === 'tool_result' ? [b.tool_use_id] : [])))
        : new Set<string>();
    if (!ids.every((id) => answered.has(id)))
      return msgs.slice(0, Math.max(0, firstTurnStart(msgs, i)));
  }
  return msgs;
}

/** A 400 saying a replayed thinking block no longer matches this conversation. */
export function isStaleThinking(err: InstanceType<typeof Anthropic.BadRequestError>): boolean {
  const detail = `${err.message} ${(err.error as { error?: { message?: string } } | undefined)?.error?.message ?? ''}`;
  return /`?thinking`? block/i.test(detail) && /signature|different conversation/i.test(detail);
}

/** The history without any thinking blocks (text and tool calls stay). Removing all of
 *  them is always accepted by the API; the model just loses that earlier reasoning. */
export function stripThinking(msgs: Msg[]): Msg[] {
  return msgs.map((m) => {
    if (m.role !== 'assistant' || typeof m.content === 'string') return m;
    const content = m.content.filter(
      (b) => b.type !== 'thinking' && b.type !== 'redacted_thinking',
    );
    return { ...m, content: content.length ? content : [{ type: 'text', text: '…' }] };
  });
}

/** Index of the user message that began the turn containing index i. */
function firstTurnStart(msgs: Msg[], i: number): number {
  for (let k = i; k >= 0; k--) {
    const m = msgs[k] as Msg;
    if (
      m.role === 'user' &&
      (typeof m.content === 'string' || !m.content.some((b) => b.type === 'tool_result'))
    )
      return k;
  }
  return 0;
}

/** Plain-English messages for API failures (typed checks, most specific first). */
export function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError)
    return 'Your Anthropic API key was rejected. Check it in Settings › AI.';
  if (err instanceof Anthropic.PermissionDeniedError)
    return "This API key isn't allowed to use that model. Check your Anthropic console.";
  if (err instanceof Anthropic.NotFoundError)
    return "That model isn't available to your account. Pick another in Settings › AI.";
  if (err instanceof Anthropic.RateLimitError)
    return 'Anthropic is limiting requests right now. Try again in a moment.';
  if (err instanceof Anthropic.BadRequestError) {
    const detail =
      (err.error as { error?: { message?: string } } | undefined)?.error?.message ?? err.message;
    return `Anthropic rejected the request: ${detail} (If your credit has run out, top up at console.anthropic.com.)`;
  }
  if (err instanceof Anthropic.InternalServerError)
    return 'Anthropic is having trouble right now. Try again shortly.';
  if (err instanceof Anthropic.APIConnectionTimeoutError)
    return 'Anthropic took too long to respond. Try again.';
  if (err instanceof Anthropic.APIConnectionError)
    return "I couldn't reach Anthropic. Check your internet connection.";
  if (err instanceof Anthropic.APIError)
    return `Anthropic error ${err.status ?? ''}: ${err.message}`.trim();
  return err instanceof Error ? err.message : 'Something went wrong talking to Claude.';
}
