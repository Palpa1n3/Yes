# ARC: Adaptive Response Core

A holographic, HUD-style desktop assistant for Windows (also runs on macOS and Linux), built with Electron, React and TypeScript. ARC shows live system telemetry, launches your apps, searches the web, and talks back with a configurable personality. The AI is a built-in **mock** for now, structured so a real model drops in without refactoring.

> Everything runs and is stored locally. Nothing is sent anywhere except the web searches and pages you ask ARC to open in your browser.

---

## Quick start (Windows)

1. Install **Node.js 22 LTS** or newer from <https://nodejs.org>.
2. Open the project folder, click the File Explorer address bar, type `cmd`, press Enter.
3. Install dependencies (downloads Electron, ~1–3 min):
   ```bash
   npm install
   ```
4. Run it:
   ```bash
   npm run dev
   ```

If you ever see **`Error: Electron uninstall`**, run `npm run setup:electron` (some npm setups skip Electron's download step).

### Install it like a normal app

Close ARC, then in the `arc` folder run:

```bat
npm run installer
```

It takes a few minutes and creates `dist\ARC-Setup-<version>.exe`. Run that to install ARC with a desktop icon and Start-menu entry. Windows may show **"Windows protected your PC"** because the app isn't code-signed: click **More info** → **Run anyway**. After installing, open ARC from the Start menu instead of `npm run dev`; your settings, keys, routines and timers carry over. Turn on **Settings › General › Launch at login** so it starts quietly in the tray. To update later: extract the new zip, run `npm install` if asked, then `npm run installer` again and install over the top.

If the build fails with "Cannot create symbolic link", open Command Prompt **as administrator** (or turn on Windows Settings › System › For developers › Developer Mode) and run it again.

## Scripts

| Command                                                 | What it does                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `npm run dev`                                           | Dev mode with hot reload (adds a **Dev · core state** switcher, Alt+1…6) |
| `npm run build`                                         | Typecheck + production build into `out/`                                 |
| `npm run preview`                                       | Run the production build                                                 |
| `npm run package:win` / `package` / `package:dir`       | Installer for Windows / current OS / unpacked folder                     |
| `npm test`                                              | Unit and component tests (Vitest)                                        |
| `npm run lint` · `npm run typecheck` · `npm run format` | Code quality                                                             |

## Using ARC

- **Ctrl+Space** (anywhere) shows/hides ARC and focuses the input. If another app owns it, ARC falls back to Ctrl+Shift+Space and says so. Change it in **Settings › Hotkeys**.
- **Closing** the window hides ARC to the **tray**; quit from the tray menu. (Linux: closing quits.)
- **Compact mode** (⤡ in the title bar, `/mode compact`, or the tray): a 420×120 always-on-top pill.
- Try: `open spotify`, `close opera`, `volume 30`, `mute`, `pause`, `next song`, `open my downloads`, `find invoice`, `remind me in 10 minutes to stretch`, `lock my pc`, `search for cheap flights`, `how's my system?`.
- **Keys:** `/` command palette · ↑/↓ history · Esc clear/stop/close · Ctrl+1…6 tabs · Ctrl+, settings · Enter/Esc approve/cancel a command card.
- **Slash commands:** `/help` `/clear` `/settings` `/personality` `/mode compact` `/mode full`.

### Tabs

| Tab      | Shows                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------- |
| Overview | Timers, live weather, vitals, core, console, network, drives, activity log                     |
| System   | Per-thread CPU, memory, CPU/RAM/GPU history, top processes, GPU                                |
| Tasks    | Built-in Task Manager: every app and process with CPU and memory, search, sort, End task       |
| Apps     | Your `apps.json` as a launch grid, add installed apps, edit trigger phrases, open your folders |
| Network  | Live throughput, interfaces, gateway & latency                                                 |
| Storage  | Drive gauges, recent downloads, folder sizes on demand                                         |
| Routines | Your routines: build, edit and run them, see each step's result                                |

### Timers and reminders

- Start one from the **Timers** panel (Overview: 5/10/25 min or custom, with a label), or say _"remind me in 20 minutes to check the oven"_.
- The next countdown also shows beside the clock (and in compact mode). **+5** extends a running timer; **×** cancels it.
- When one ends: a repeating alarm chime (up to 2 minutes; toggle and volume in Settings › Voice), a Windows notification, a flashing taskbar icon, and a **Time's up** banner with **Dismiss** / **Snooze 5**.
- Timers are saved to `%APPDATA%\ARC\timers.json`, so they survive restarts; anything that finished while ARC was closed rings on the next start.
- Cancel by voice/text: _"cancel the oven timer"_, _"cancel all timers"_.

### Voice

- **Talking to ARC:** click the mic in the message box and speak; ARC sends it when you pause (or hold the mic and let go). Esc cancels. Speech is turned into text by Whisper running on your own PC: free, and your voice is never uploaded. The model downloads once the first time (Standard ≈ 75 MB, Better ≈ 250 MB, Settings › Voice) into `%APPDATA%\ARC\models`.
- **ARC's voice:** Settings › Voice › Voice › **Fish Audio**, paste your Fish Audio API key (fish.audio › API keys) and press **Save & test**. The key is checked, then stored encrypted like the Claude key. The voice ID defaults to the one you chose; you can paste another from any fish.audio voice page. The **S2.1 Pro Free** model is used by default. Reply text is sent to Fish Audio to be spoken; if it fails, ARC falls back to the Windows voice and says why.
- **Voice shortcut:** press **Ctrl+Alt+Space** from any app (even with ARC hidden) and speak; ARC sends it when you pause, or press it again to send straight away. Change or turn it off in Settings › Hotkeys.
- **Wake word:** turn on **Wake word "Hey ARC"** in Settings › Voice, then say _"Hey ARC, what's the weather?"_ (or _"Hey ARC"_, wait for the chime, then speak). The mic stays on while it's enabled; only stretches of speech are checked, by Whisper on this PC, and ARC ignores what it hears while it's talking itself. A green dot on the mic button shows it's listening. It follows the assistant name you set.
- If the mic doesn't work: Windows Settings › Privacy & security › Microphone › turn on **Let desktop apps access your microphone**.

### Routines and the morning briefing

- A routine is a list of steps run in order: open or close apps, set the volume, music controls, open a folder or website, search the web, start a timer, say something, wait, give a briefing, or lock the PC.
- Run one by typing or saying its name or one of its phrases (_"work mode"_, _"good morning"_). This runs straight away without using AI credit. You can also press **Run** in the Routines tab, or ask Claude (_"start my focus routine"_).
- Steps go through the same command system as chat, so the same safety rules apply. Closing an app is always a polite close. If a step fails, the rest still run and the Routines tab shows why.
- **Morning briefing**: the time, your weather, running timers, and anything wrong with the PC (drives over 90% full, high memory use, a hot processor, low battery, or no restart for a week). Tick **Run when ARC starts (once a day)** to get it each day in place of the usual greeting.
- **Timed routines:** tick **Run at a set time**, pick a time and the days (weekdays are pre-selected). They run while ARC is open or sitting in the tray; if the PC is off or asleep at that time, that run is skipped.
- Three examples come built in (Morning briefing, Focus mode, Wind down). They're saved in `%APPDATA%\ARC\routines.json`.

### Task Manager (Tasks tab)

- Every running app and process, grouped like Windows Task Manager (**Apps**, **Background processes**, **Windows processes**), updated every 2 seconds. Click CPU, Memory or Name to sort; search by name.
- **End task** asks the app to close, like clicking × (it can still ask you to save). If it doesn't close, ARC offers **Force end**, which only happens after you confirm, and unsaved work in that app is lost.
- Windows' own processes and ARC itself show a lock and can't be ended. Claude can never force-end anything.
- Frozen apps show **Not responding** in red, with their End task button always visible.

### Weather

- Set your town in **Settings › General › Weather** (or straight from the Weather panel). Choose °C/°F and mph/km/h there too.
- The Weather panel shows now, feels-like, wind, the next 8 hours with rain chance, sunrise/sunset and tomorrow; the temperature also sits beside the clock.
- Data comes from [Open-Meteo](https://open-meteo.com) (free, no account or key). Only the town's map position is sent. It refreshes every 15 minutes and the last reading is kept in `%APPDATA%\ARC\weather.json` for when you're offline.
- Ask _"what's the weather?"_, _"do I need an umbrella?"_, _"will it rain later?"_. Claude uses the `get_weather` tool; the offline brain answers simple ones.

### Your data

All in `%APPDATA%\ARC\` (Settings › Advanced › Data folder):

| File                | Contents                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `settings.json`     | All settings incl. personality. Hand-editing is safe: invalid values fall back to defaults. |
| `apps.json`         | App registry: `{ id, name, path?, args?, startMenu?, uri?, icon?, intents[] }`              |
| `history.json`      | Last 200 conversation messages (turn off in Settings › General)                             |
| `window-state.json` | Window position/size                                                                        |

## Personalities

Four presets (Butler, Co-pilot, Terminal, Mentor) live in `src/shared/personalities.ts` as data. In **Settings › Personality** you can tune verbosity, humour, proactivity, tone, how ARC addresses you, and whether it asks before acting, with a live preview. The personality also generates the system prompt a real model will receive (visible in Settings › Advanced).

## Architecture

```
src/
  main/        Electron main: window, tray, hotkey, compact mode, IPC handlers, services
    services/  telemetry (systeminformation), app-registry, command-executor, os-launch,
               ai-provider (MockProvider), skills, settings-store, history-store
  preload/     Exposes the typed window.arc bridge (contextBridge), nothing else
  renderer/    React UI: components/{core,hud,transcript,input,panels,settings,tabs},
               stores (Zustand), hooks, voice (speech + sfx), themes
  shared/      Types and pure logic used by both sides: ipc.ts (channel contracts),
               commands.ts (canonIntent), personalities.ts, settings.ts, skills.ts
```

- **Security:** `contextIsolation`, `sandbox`, no `nodeIntegration`, strict CSP, navigation blocked. The renderer never touches Node; ESLint enforces it. Main only opens a fixed set of folders, only http(s) URLs from the AI, and launches processes without a shell.
- **IPC** is typed end to end: channel names and argument/result types are declared once in `src/shared/ipc.ts`.
- **Command pipeline:** user text → AI provider → raw intent `{ action, target }` → `canonIntent()` → skills (first refusal) → executor → `CommandResult` → command card + activity log.
- **Launching on Windows:** `apps.json` entry → exe path (checked with `existsSync`) → Windows Start-menu lookup (`Get-StartApps`, launched via `explorer shell:AppsFolder\…`) → app URI (only if a handler is registered). Launched apps are detached so they outlive ARC.
- **Telemetry** polls each probe on its own cadence (2 s CPU/RAM/network … 30 s disks; processes only while the System tab is open) and stops entirely while the window is hidden.

## How to add a command

1. **Teach the normaliser the phrasing.** Add synonyms to `SYNONYMS` in `src/shared/commands.ts`. For a new action, add it to `CANONICAL_ACTIONS` and `RISK`.
2. **Handle it.** Either add a `case` in `src/main/services/command-executor.ts`, or write a skill (below).
3. **Show it nicely.** Add a verb in `describeCommand()` (`src/renderer/stores/conversationStore.ts`).
4. **Test it.** Add phrases to `tests/commands.test.ts` and behaviour to `tests/main/executor.test.ts`.

Commands marked `risk: 'destructive'` automatically get an Approve/Cancel card unless the personality says "never ask".

## How to add a skill

Skills get first refusal on commands for the actions they declare (`src/shared/skills.ts`):

```ts
import type { ArcSkill } from '@shared/skills';

export const weatherSkill: ArcSkill = {
  id: 'weather',
  name: 'Weather',
  intents: ['weather', 'forecast'],
  actions: ['system_query'],
  async handler(cmd, ctx) {
    if (!/weather|forecast/i.test(cmd.target ?? '')) return null; // decline: let others try
    return { commandId: cmd.id, status: 'success', message: 'Sunny, 21°C', timestamp: Date.now() };
  },
};
```

Register it in `src/main/ipc/index.ts` (`skills.register(weatherSkill)`). See `systemReportSkill` in `src/main/services/skills.ts` for a working example, and `tests/main/skills.test.ts` for how to test one.

## AI: Claude

ARC works offline with a built-in mock, or with Claude for real conversation and actions.

1. Get an API key at <https://console.anthropic.com> (API Keys). Add a little credit and, ideally, a monthly limit under **Limits**.
2. In ARC: **Settings › Advanced › AI → Claude**, paste the key, **Save & test**. The test uses the Models API, so it costs nothing.
3. Pick a model: **Haiku 5.5** (default; fastest and cheapest), **Sonnet 5.5** (~20× Haiku per message) or **Opus 5.5** (~40×). Switch any time; the status bar shows the active one.

How it works (`src/main/services/anthropic-provider.ts`):

- The key is validated, then encrypted with the OS keychain (`safeStorage`, DPAPI on Windows) into `%APPDATA%\ARC\anthropic-key.bin`. It never reaches the renderer, logs or settings.
- ARC runs a streaming Messages API tool loop. Claude can `launch_app`, `close_app` (always confirmed unless the personality never asks; polite close, never force-kill, never Windows/ARC processes), `set_volume`, `media_control`, `open_folder`, `find_files` (your own folders only), `reveal_file` (shows, never runs), `set_timer` (Windows notification), `lock_screen`, `open_url`, `search_web`, `get_system_status`, `get_weather`, `list_routines`, `run_routine` and `list_apps`. Every action except `list_apps` goes through ARC's command cards (approval per your personality, activity log), and the outcome, including "cancelled", is sent back to Claude.
- Effort is `low` (chat), the personality prompt is cached, at most 8 model steps run per reply, and Sonnet/Opus use Anthropic's default server-side fallback. Haiku has none, so a refusal shows a message.
- No key, or offline: ARC says so and answers with the mock. Bad key, no credit or rate limits produce plain-English messages.

To add another provider, implement `AIProvider` (`src/main/services/ai-provider.ts`) and select it in `src/main/ipc/assistant.ts`.

## Voice

- **Speak replies** uses the system voices (Settings › Voice). Word boundaries drive the core's pulse.
- **Voice input / wake word:** interfaces are in `src/renderer/voice/providers.ts` (`SpeechInputProvider`). Electron can't use Chromium's Google speech service, so a local engine (e.g. Whisper) is the planned provider. Push-to-talk already drives the `listening` state.
- **Sound effects** are synthesised with Web Audio (no files); toggle and volume in Settings › Voice.

## Troubleshooting

| Problem                     | Fix                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `Error: Electron uninstall` | `npm run setup:electron`                                                                                                      |
| Ctrl+Space does nothing     | Another app has it; see Settings › Hotkeys for the active one, or record a new one                                            |
| "No temp data"              | Windows hides CPU temperature from normal apps; GPU temp/load need a driver that reports them (NVIDIA works)                  |
| An app won't launch         | Settings › Advanced › App list: check `path`/`startMenu`, or use Apps › Add app                                               |
| `npm audit` warnings        | They come from build tools (a `picomatch` advisory with no fix released yet), not the app. Don't run `npm audit fix --force`. |

## Accessibility

Full keyboard operation with visible focus rings, ARIA roles for tabs/dialogs/switches, automated axe-core audit clean on every tab and settings page, and **Reduce motion** (System/On/Off) that stops rotation, particles, the boot sequence and typewriter effects.
