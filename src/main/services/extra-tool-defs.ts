/** Descriptions of the local tools added in batch 6 (handled by the `extra` map in main). */
import type Anthropic from '@anthropic-ai/sdk';
import { SMART_HOME_TOOL } from '@shared/smartthings';

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
  SMART_HOME_TOOL,
  {
    name: 'cyberpunk_mods',
    description:
      "The user's Cyberpunk 2077 mods (installed with Vortex) and their updates from Nexus Mods. Actions: diagnose also reads crash reports when the game crashes while playing (where it crashed, mods on the stack, quest and district, TweakXL's rejected changes). fix (fix the last launch's problem: switch off a crashing RED4ext plugin, send its update to Vortex, or deploy REDmod again without broken script mods; the user approves; undo in the Mods tab), load_order (archive clashes — the first archive loaded wins — alternative versions installed together, suggested moves for patches, and whether the last REDmod deploy failed and why), apply_load_order (save the suggested order; the user approves), diagnose (why the game won't start or crashes on launch: reads its RED4ext and redscript logs, names the plugin it stops on and the Vortex mod behind it, and plugins older than the game's patch; explain the fix in plain words), summary (what's installed, what has updates since the last check), check (ask Nexus now; the first check takes about a minute), find (installed mods matching `name`, with installed and latest versions), open (`what`: folder = the mod's files, page = its Nexus page, game = the game folder, vortex = Vortex's mods folder), update (`name` = a mod or \"all\"; the user approves, then Vortex downloads and installs it on Premium, or its Nexus Files page opens). Alton never unpacks or runs mod files itself.",
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'diagnose',
            'fix',
            'load_order',
            'apply_load_order',
            'summary',
            'check',
            'find',
            'open',
            'update',
          ],
        },
        name: { type: 'string' },
        what: { type: 'string', enum: ['folder', 'page', 'game', 'vortex'] },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'summarise_messages',
    description:
      'Summarise the user\'s phone messages that reached the PC (grouped by person or group chat, newest first, with what needs an answer). Say it in one or two sentences, e.g. "6 messages: Will\'s asking about tonight, Mum wants a call, 4 in the group chat about Saturday." Offer to reply.',
    input_schema: {
      type: 'object',
      properties: { hours: { type: 'number', description: 'Only the last N hours (default 12)' } },
      additionalProperties: false,
    },
  },
  {
    name: 'reply_phone_message',
    description:
      'Reply to a phone message from the PC: the phone sends it through that message\'s own notification. "reply: on my way" answers the last message read out; give "to" (a person or group) for another. The user may be asked to approve first. Say it\'s on its way; Alton confirms out loud when the phone has sent it.',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string' }, to: { type: 'string' } },
      required: ['text'],
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
    name: 'download_mode',
    description:
      'Download mode: give Steam as much of the connection as possible. Pauses bandwidth-hungry background apps (OneDrive, Dropbox, Google Drive, other game launchers, torrent clients; reopened afterwards), sets Steam to high priority, keeps the PC awake and warns if Steam has a download limit set. It ends by itself when Steam finishes; "then" can shut down or sleep the PC afterwards (the user approves). on false ends it now. Browsers are left alone: suggest closing streams/videos.',
    input_schema: {
      type: 'object',
      properties: {
        on: { type: 'boolean' },
        then: { type: 'string', enum: ['none', 'shutdown', 'sleep'] },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'minecraft_build',
    description:
      'Build something in Minecraft (Java Edition): you design it as setblock / fill / clone commands with RELATIVE coordinates (~x ~y ~z, from where the player stands; build in front of them, e.g. starting at ~2 ~ ~2), and it is saved into their world as a datapack function. Then in game they type /reload and /function alton:<name> (cheats must be allowed). Use correct block ids (minecraft:oak_planks, minecraft:glass_pane[facing=…] etc.); prefer fill for walls/floors, hollow interiors with fill … hollow or air. Plan the size first, keep it buildable (under 20,000 commands). action "list" shows their worlds (most recent first; default world = most recently played). If the game is open, offer to type the two commands for them with Agent Mode.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['build', 'list'] },
        name: { type: 'string', description: 'Short name, e.g. "castle".' },
        description: { type: 'string' },
        world: { type: 'string', description: 'World folder name (optional).' },
        commands: { type: 'array', items: { type: 'string' } },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'journey_time',
    description:
      'How long it takes to get somewhere by car (default), on foot or by bike, from home (or "from"), using OpenStreetMap routes. There is no live traffic, so the answer already allows a margin for driving; say so. With arrive_by (HH:MM) it also gives the time to leave. For the user\'s calendar events with a location, Alton also gives "leave by" heads-ups by itself.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Place, address or postcode.' },
        from: { type: 'string', description: 'Default: home.' },
        mode: { type: 'string', enum: ['driving', 'walking', 'cycling'] },
        arrive_by: { type: 'string', description: '24-hour HH:MM, optional.' },
      },
      required: ['to'],
      additionalProperties: false,
    },
  },
  {
    name: 'shop',
    description:
      'Shop online for the user with Agent Mode (eBay, Amazon, Vinted, or another shop they name): search, scroll and compare listings, and depending on "goal": "find" (report the best options with prices incl. postage), "offer" (make an offer up to max_price) or "buy" (buy the best match within max_price). Offers, Buy It Now, checkout and paying ALWAYS need the user\'s approval (twice for the final payment); card details are never typed. With "seller_questions", it messages sellers to ask those things (allowed without asking per the user\'s permission setting; anything that commits to a price still asks). Seller replies take time: offer to check back later with schedule_agent_task ("check my eBay/Vinted messages and tell me the replies"). Before calling, make sure you know what they want (item, size, condition, budget); ask if unclear.',
    input_schema: {
      type: 'object',
      properties: {
        request: {
          type: 'string',
          description: 'What they want, with details: size, colour, condition, model, must-haves.',
        },
        site: {
          type: 'string',
          description: 'ebay, amazon, vinted, or another shop; default eBay.',
        },
        goal: { type: 'string', enum: ['find', 'offer', 'buy'] },
        max_price: { type: 'number', description: 'Top price in pounds including postage.' },
        seller_questions: {
          type: 'string',
          description: 'Questions to ask sellers of the best listings (optional).',
        },
        check_messages: {
          type: 'boolean',
          description:
            "Instead of searching: open the site's messages, report new replies from sellers, and answer simple questions about the item.",
        },
      },
      required: ['request'],
      additionalProperties: false,
    },
  },
  {
    name: 'phone_messages',
    description:
      'Read the user\'s phone text messages, or reply to one, through Windows Phone Link (their Android phone linked to this PC). Uses Agent Mode: it opens Phone Link › Messages and reads the screen, or types a reply. "read": reports the newest conversations (optionally only from "who"); the result arrives as Agent Mode\'s report, so tell the user it is checking. "reply": types "message" in the conversation with "who" and ALWAYS asks the user before pressing Send. Never invent messages. If Phone Link isn\'t set up, explain: open Phone Link on the PC and "Link to Windows" on the phone (Samsung has it built in), sign in with the same Microsoft account, and allow Messages.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['read', 'reply'] },
        who: {
          type: 'string',
          description: 'Contact name as shown in Phone Link (optional for read).',
        },
        message: { type: 'string', description: 'For reply: the exact text to send.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'schedule_agent_task',
    description:
      'Schedule an Agent Mode task to run by itself later, even if the user is away (e.g. "at 4:50 continue Claude Code", "in an hour, check my downloads and restart the one that failed"). When the time comes, Agent Mode starts and uses the mouse and keyboard to do it; it still asks (on the PC and the phone) before anything risky. Use this instead of a reminder whenever the user wants something DONE at a time, not just reminded. Give "at" (24-hour HH:MM, today or the next time it comes round) or "minutes" (up to 24 hours). Write the task as clear step-by-step instructions for yourself, with the app and what to type or click. Cancel with cancel_timer.',
    input_schema: {
      type: 'object',
      properties: {
        task: { type: 'string' },
        at: { type: 'string', description: '24-hour local time, e.g. 16:50' },
        minutes: { type: 'number' },
      },
      required: ['task'],
      additionalProperties: false,
    },
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
