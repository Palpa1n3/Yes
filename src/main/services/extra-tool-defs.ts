/** Descriptions of the local tools added in batch 6 (handled by the `extra` map in main). */
import type Anthropic from '@anthropic-ai/sdk';

const none = { type: 'object' as const, properties: {}, additionalProperties: false };

export const EXTRA_TOOL_DEFS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'organize_folder',
    description:
      "Tidy the user's Downloads, Desktop or Documents: loose files are moved into folders by type (Pictures, Documents, Installers…). The user sees the plan and approves first; nothing is deleted and it can be undone.",
    input_schema: {
      type: 'object',
      properties: { folder: { type: 'string', enum: ['downloads', 'desktop', 'documents'] } },
      required: ['folder'],
      additionalProperties: false,
    },
  },
  {
    name: 'undo_organize',
    description: 'Undo the last folder tidy-up (puts the files back).',
    input_schema: none,
  },
  {
    name: 'search_documents',
    description:
      'Search inside the user\'s own files (Documents, Desktop, Downloads, OneDrive Documents: text, Word, CSV, Markdown and similar; not PDFs) for words or a topic. Returns file paths with a matching snippet. Use for "find my notes about…", "which file had the wifi password…".',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_minecraft_mods',
    description:
      'Check modded Minecraft installs (default launcher, CurseForge, Prism, Modrinth, Technic): mod count, duplicate mods (two versions of the same mod), mixed loaders, the latest crash report and recent errors from the log. Use for Minecraft crashes or mod conflicts; explain the cause and which mod to remove or update.',
    input_schema: {
      type: 'object',
      properties: {
        instance: { type: 'string', description: 'Part of the instance/modpack name' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_optimization_tips',
    description:
      'Check the PC for easy speed-ups: startup apps, days since restart, drive space, memory hogs and power plan, with plain-English tips. Use when the PC feels slow or they ask how to optimise it.',
    input_schema: none,
  },
  {
    name: 'run_benchmark',
    description:
      'A quick (about 5 s) benchmark of processor, disk and memory speed, compared with the last run; also how much memory Alton uses. Use for "how fast is my PC", "is it slower than before".',
    input_schema: none,
  },
  {
    name: 'play_on_spotify',
    description:
      'Open Spotify searching for a song, artist, album, playlist or mood (e.g. "lofi beats", "Arctic Monkeys"). When asked for recommendations, pick something that fits what they like (memories, what is playing) and explain the pick in one line.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'post_to_discord',
    description:
      "Post a message to the user's Discord channel (through the webhook they saved in settings). They approve the exact text first.",
    input_schema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
      additionalProperties: false,
    },
  },
  {
    name: 'remind_when_app_opens',
    description:
      'A reminder that pops up the next time the user opens a particular app (e.g. "when I open Steam, remind me to update my drivers"). Windows only.',
    input_schema: {
      type: 'object',
      properties: { app: { type: 'string' }, text: { type: 'string' } },
      required: ['app', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_app_reminders',
    description: 'App-triggered reminders still waiting.',
    input_schema: none,
  },
  {
    name: 'cancel_app_reminder',
    description: 'Cancel app-triggered reminders matching these words.',
    input_schema: {
      type: 'object',
      properties: { match: { type: 'string' } },
      required: ['match'],
      additionalProperties: false,
    },
  },
  {
    name: 'run_self_test',
    description:
      "Run your own (ARC's) automated test suite from the source folder and report what passes or fails. Use when debugging yourself or checking a fix the user applied. Takes up to a few minutes.",
    input_schema: none,
  },
  {
    name: 'start_background_research',
    description:
      'Research a topic on the web in the background while the conversation carries on; the finished write-up is saved in Notes and announced. Use when the user says "look into X and tell me later" or the research would take a while.',
    input_schema: {
      type: 'object',
      properties: { topic: { type: 'string' } },
      required: ['topic'],
      additionalProperties: false,
    },
  },
  {
    name: 'look_at_all_screens',
    description:
      "See every monitor at once (multi-monitor setups). Use when the user has more than one screen and refers to 'my other screen', 'the left monitor', or look_at_screen didn't show what they mean.",
    input_schema: none,
  },
  {
    name: 'power_pc',
    description:
      'Shut down, restart or sleep this PC, or cancel a planned shutdown/sleep (including one waiting for Steam). The user is asked to approve, and there is always a countdown (default 1 minute) they can cancel. Use minutes for "shut down in 30 minutes".',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['shutdown', 'restart', 'sleep', 'cancel'] },
        minutes: { type: 'number', description: 'Delay before it happens (default 1).' },
        reason: { type: 'string' },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'steam_downloads',
    description:
      'What Steam is downloading or updating right now (with progress), what is waiting, and any planned "shut down when done".',
    input_schema: none,
  },
  {
    name: 'when_steam_updates_finish',
    description:
      'Wait for Steam to finish the games it is downloading/updating now (or one named game), then shut down the PC (default), put it to sleep, or just tell the user. The user approves first; there is a 2-minute warning before shutting down. Cancel with power_pc action "cancel".',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['shutdown', 'sleep', 'notify'] },
        game: { type: 'string', description: 'Only wait for this game (optional).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_background_tasks',
    description: 'Background research jobs and their status.',
    input_schema: none,
  },
];

export const EXTRA_TOOL_NAMES = new Set(EXTRA_TOOL_DEFS.map((t) => t.name));
