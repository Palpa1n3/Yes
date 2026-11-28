# Alton codebase

Written automatically by Alton from its own code (version 1.9.0); don't edit by hand.
370 source files, 75,840 lines, 147 test files.

## src/main: PC app: main process (services, system access, IPC)

| File | What it does | Lines | Used by | Tests |
| --- | --- | ---: | ---: | ---: |
| `compact.ts` | Compact mode: the main window collapses into a Spotlight-style pill near the top of the current display, pinned always-on-top. | 54 | 2 | 3 |
| `context.ts` | Everything main-process modules share. | 73 | 33 | 3 |
| `desk-icons.ts` | Small taskbar icons drawn in code (no image files): the overlay badge dots and the thumbnail toolbar buttons. | 101 | 1 | 1 |
| `desk-state.ts` | Small bits of live state the desktop widget and taskbar need, reported by the parts of the app that know them (the renderer, Agent Mode, the updater). | 14 | 5 | 1 |
| `desk.ts` | The desktop widget, the taskbar strip and the taskbar features (thumbnail toolbar, jump list, overlay badge, progress bar, live tray tooltip), all from one snapshot of what's go… | 600 | 2 | 1 |
| `holo.ts` | Notifications in Alton's own holographic style: small glowing cards that slide in at the bottom-right of the desktop widget's screen, stack, and fade after a few seconds. | 109 | 7 | 1 |
| `hotkey.ts` | Registers the show/hide shortcut. | 49 | 3 | 3 |
| `index.ts` | — | 707 | 0 | 0 |
| `ipc/agent.ts` | — | 537 | 1 | 0 |
| `ipc/app.ts` | — | 97 | 1 | 0 |
| `ipc/approval.ts` | A generic Approve / Deny card for risky steps that aren't ordinary actions (moving files, posting to Discord…). | 33 | 1 | 0 |
| `ipc/assistant.ts` | — | 672 | 1 | 0 |
| `ipc/awareness.ts` | The app in front, first-opens per day (habits) and app-triggered reminders. | 112 | 1 | 0 |
| `ipc/calendar.ts` | — | 68 | 1 | 0 |
| `ipc/chats.ts` | — | 89 | 1 | 0 |
| `ipc/cleanup.ts` | — | 57 | 1 | 0 |
| `ipc/clipHealth.ts` | Samples health every minute (independent of the HUD, which pauses when hidden). | 84 | 1 | 0 |
| `ipc/commands.ts` | — | 124 | 1 | 0 |
| `ipc/email.ts` | — | 96 | 1 | 0 |
| `ipc/games.ts` | Where Steam is installed (from the registry), or null. | 76 | 3 | 1 |
| `ipc/gaming.ts` | — | 138 | 1 | 0 |
| `ipc/handle.ts` | Channels with a handler or listener in main (for the start-up health check). | 45 | 29 | 1 |
| `ipc/index.ts` | Central registration: every channel group is wired here, once. | 456 | 1 | 0 |
| `ipc/info.ts` | — | 83 | 1 | 0 |
| `ipc/initiative.ts` | — | 67 | 1 | 0 |
| `ipc/media.ts` | — | 14 | 1 | 0 |
| `ipc/notes.ts` | — | 43 | 1 | 0 |
| `ipc/offsite.ts` | Encrypted backups to another drive or folder (safety gate 5): daily when a folder is chosen, plus Back up now, a new recovery code, and restore (Settings › Privacy › Backups). | 96 | 1 | 0 |
| `ipc/power.ts` | Minutes from now until "HH:MM" (today, or tomorrow if it's passed), or the given minutes. | 501 | 1 | 1 |
| `ipc/previews.ts` | — | 28 | 1 | 0 |
| `ipc/remote-api.ts` | — | 484 | 1 | 1 |
| `ipc/remote.ts` | MAC addresses of the adapters with a home-network address (for Wake-on-LAN apps). | 450 | 1 | 0 |
| `ipc/routines.ts` | — | 92 | 1 | 0 |
| `ipc/screen.ts` | Picture of the display under the mouse pointer, longest side ≤ 1568 px. | 59 | 3 | 0 |
| `ipc/settings.ts` | — | 12 | 1 | 0 |
| `ipc/system.ts` | — | 11 | 1 | 0 |
| `ipc/timers.ts` | — | 26 | 1 | 0 |
| `ipc/toolbox.ts` | — | 910 | 1 | 0 |
| `ipc/updates.ts` | Checks GitHub Releases (repo set in electron-builder.yml), downloads in the background, installs when ARC restarts. | 119 | 1 | 0 |
| `ipc/voice.ts` | — | 127 | 1 | 0 |
| `ipc/weather.ts` | — | 40 | 1 | 0 |
| `ipc/window.ts` | — | 31 | 1 | 0 |
| `raw.d.ts` | — | 5 | 0 | 0 |
| `services/agent-input-win.ts` | Windows mouse + keyboard for Agent Mode: one long-lived PowerShell process with a small C# helper (user32 SendInput / SetCursorPos). | 221 | 3 | 5 |
| `services/agent-runner.ts` | Agent Mode: Claude operates the PC with the computer toolset (screenshots, mouse, keyboard) until the task is done, the step limit is reached, or the user stops it. | 806 | 2 | 5 |
| `services/ai-provider.ts` | AI provider abstraction. | 630 | 3 | 23 |
| `services/anthropic-provider.ts` | Claude via the Anthropic Messages API, with ARC's actions as tools. | 1527 | 3 | 19 |
| `services/app-registry.ts` | App registry: userData/apps.json, seeded with defaults on first run. | 188 | 3 | 2 |
| `services/calendar.ts` | Reads a calendar from its private iCal address (fetched in main; the address is a secret), expands repeating events into the coming fortnight, refreshes every 10 minutes and rai… | 225 | 2 | 1 |
| `services/chat-store.ts` | Saved chats: userData/chats/index.json (titles, order, active chat) plus one messages file per chat. | 375 | 4 | 3 |
| `services/cleanup.ts` | Sizes and clears a fixed set of cache/temp folders (contents only, never the folders themselves). | 264 | 1 | 1 |
| `services/clipboard-history.ts` | Watches the clipboard (text only) and remembers recent copies, in memory only. | 96 | 1 | 1 |
| `services/command-executor.ts` | Command executor (main process only). | 380 | 4 | 2 |
| `services/crash-reports.ts` | Crash investigation: recent app crashes / hangs and unexpected shutdowns from the Windows event logs (read-only), for Claude's get_recent_crashes tool. | 96 | 1 | 1 |
| `services/cyberpunk-mods.ts` | Cyberpunk 2077 mods: reads what Vortex has installed, asks Nexus Mods (with the user's own API key, stored encrypted) which have newer versions, and hands updates to Vortex to d… | 2445 | 2 | 0 |
| `services/data-backup.ts` | Automatic backup and recovery of Alton's own data: settings, notes and memories, routines, apps list, chats, shifts, habits, plugins and the mod tools' records. | 236 | 7 | 4 |
| `services/dev-sandbox.ts` | Sandboxed development (Phase 3, item 4): Alton makes a separate copy of its own project (a local git clone outside the project folder; dependencies linked, not copied), changes … | 377 | 3 | 3 |
| `services/diagnostics.ts` | Self-debugging: an error/warning log (main + renderer) and read-only access to ARC's own source folder, so Claude can explain problems and draft fixes. | 374 | 3 | 6 |
| `services/download-mode.ts` | Download mode: give Steam the connection. | 135 | 2 | 4 |
| `services/email.ts` | Any email provider over IMAP (Gmail, Yahoo, iCloud, BT, your own domain…; see shared/mail-servers.ts). | 181 | 5 | 19 |
| `services/extra-tool-defs.ts` | Descriptions of the local tools added in batch 6 (handled by the `extra` map in main). | 478 | 1 | 19 |
| `services/fish-tts.ts` | Text-to-speech with Fish Audio (POST https://api.fish.audio/v1/tts). | 87 | 2 | 1 |
| `services/foreground-watch.ts` | The app in front (Windows): a long-lived PowerShell reads the foreground window's process, title and whether it fills the screen every 2 s, printing a JSON line on change. | 140 | 2 | 1 |
| `services/gaming-sessions.ts` | Gaming performance: while gaming mode is on, sample CPU/GPU load and temperatures every 15 s; when it ends, keep a summary (last 30 sessions) for "how did my game run?". | 132 | 3 | 4 |
| `services/gaming.ts` | Watches for games; while one runs: High performance power plan, close chosen apps (politely), quiet ARC. | 124 | 1 | 1 |
| `services/gmail-imap.ts` | The real mail backend: any IMAP server (Gmail, Yahoo, iCloud, BT, your own domain…), with the INBOX opened read-only. | 83 | 1 | 0 |
| `services/habits.ts` | Habits: when the user first opens each app each day (to spot a regular routine worth automating), plus "remind me when I open X" reminders. | 162 | 1 | 1 |
| `services/health-check.ts` | Runs the start-up health checks (shared/health.ts) against the real app. | 153 | 1 | 1 |
| `services/history-store.ts` | Conversation history in userData/history.json (last 200 messages). | 80 | 1 | 4 |
| `services/initiative.ts` | Decides when Alton speaks up: runs the suggestion rules every couple of minutes and offers at most one suggestion at a time, with cooldowns, quiet hours and no interruptions whi… | 106 | 1 | 1 |
| `services/installed-games.ts` | Installed games from Steam (library folders + app manifests) and the Epic Games Launcher (manifests). | 111 | 4 | 6 |
| `services/job-locks.ts` | Stops Alton's automated jobs clashing: each job takes the things it uses (Vortex, the mouse and keyboard, the game's mod files…) and another job wanting one of them waits or say… | 109 | 6 | 2 |
| `services/journey.ts` | Journey times from free OpenStreetMap services: place search (Nominatim) and routes (OSRM). | 151 | 2 | 2 |
| `services/knowledge.ts` | Builds the personal knowledge graph (shared/knowledge.ts) from Alton's memories with a small, cheap model, only when the memories have changed, and keeps it in userData/knowledg… | 137 | 1 | 1 |
| `services/link-preview.ts` | Fetches a page's preview data (title, picture, site, price) for research answers. | 216 | 1 | 1 |
| `services/media-watch.ts` | Windows only: a long-lived PowerShell process reads the system media session (GlobalSystemMediaTransportControls) every 1.5 s and prints a JSON line when the song or play state … | 138 | 1 | 1 |
| `services/memory-learner.ts` | Learns lasting facts about the user from chats (opt-out: Settings › General). | 187 | 1 | 1 |
| `services/minecraft-build.ts` | Minecraft (Java) building: Claude designs a build as setblock/fill commands, saved into the world as a datapack function. | 88 | 1 | 2 |
| `services/minecraft-mods.ts` | Minecraft mods (Lunar Client profiles and .minecraft, Fabric): reads every mod jar, finds problems (wrong Minecraft version, missing required mods, the same mod twice, mods that… | 628 | 1 | 0 |
| `services/network-info.ts` | On-demand network details for the Network tab (only polled while it's open). | 64 | 1 | 1 |
| `services/notes-store.ts` | userData/notes.json: lists, quick notes and memories. | 526 | 6 | 3 |
| `services/offsite-backup.ts` | Encrypted backups to a separate place (safety gate 5): another drive, a USB stick or a synced folder the user chooses. | 310 | 1 | 1 |
| `services/ollama-provider.ts` | Offline AI: a language model running on this PC through Ollama (ollama.com). | 95 | 1 | 1 |
| `services/openrgb.ts` | PC lighting through OpenRGB's SDK server (OpenRGB › SDK Server › Start server; it listens on 127.0.0.1:6742). | 467 | 1 | 1 |
| `services/os-launch.ts` | Real OS bindings for the executor (Electron main process). | 80 | 1 | 0 |
| `services/phone-messages.ts` | Phone messages on the PC: the phone sends each new message here (POST /api/phone-messages). | 170 | 5 | 3 |
| `services/phone-status.ts` | The phone's latest status (battery, unread messages, next payday), from its sync. | 37 | 3 | 2 |
| `services/plugins.ts` | Plugins: JSON files in userData/plugins. | 98 | 1 | 1 |
| `services/project-update.ts` | "Update Alton from my phone": unpack an Alton zip over the project folder, then git add, commit and push. | 208 | 3 | 4 |
| `services/proposals.ts` | Alton's improvement ideas for itself (userData/proposals.json): made weekly from its own diagnosis and code map, then accepted, dismissed or marked done by the person. | 105 | 1 | 0 |
| `services/regression.ts` | Daily self-test (Phase 3, item 5): a fresh copy of the project's last commit (its own DevSandbox, separate from the one chat uses), every check run in full, the result recorded … | 115 | 1 | 1 |
| `services/remote-page.ts` | The phone app (one self-contained page, served by RemoteServer). | 6 | 1 | 2 |
| `services/remote-server.ts` | Phone companion: a small web app served on the home network (off by default). | 412 | 2 | 2 |
| `services/rollback.ts` | Going back to the previous version when an update is broken. | 207 | 3 | 0 |
| `services/routine-service.ts` | Saved routines (userData/routines.json) and the runner. | 226 | 1 | 2 |
| `services/save-backups.ts` | Game-save backups: after a gaming session, files changed during it in the usual save folders are copied to userData/save-backups/<game>/<date-time>. | 86 | 1 | 1 |
| `services/screen-watch.ts` | Screen awareness: keeps the latest picture of what the user is looking at (never ARC itself), in memory only, so Claude can look when a question needs it. | 82 | 3 | 19 |
| `services/self-change.ts` | Approval-based code changes (Phase 3, item 6): a change Alton made and checked in its development copy goes into the real project only like this: 1. | 196 | 1 | 1 |
| `services/session-guard.ts` | Keeps userData/session.json up to date while Alton runs: a heartbeat every 30 s, the work in progress (Agent Mode task, background research) and whether it quit properly. | 87 | 3 | 0 |
| `services/settings-store.ts` | Settings held in main (the source of truth), persisted to userData/settings.json, with change notifications so the tray, hotkey and renderer stay in sync. | 76 | 2 | 4 |
| `services/shift-store.ts` | Work shifts synced from the phone app (userData/shifts.json), so the PC's Claude knows the user's rota ("am I working tomorrow?", the morning briefing). | 58 | 2 | 4 |
| `services/skills.ts` | Routes commands to skills, in registration order. | 66 | 2 | 1 |
| `services/steam-watch.ts` | Steam downloads: which games are updating (from the app manifests), and a watcher that does something (shut down, sleep, or just tell the user) once they've all finished. | 195 | 2 | 5 |
| `services/storage-info.ts` | Storage helpers: recent downloads and on-demand folder sizes (time-boxed). | 81 | 1 | 1 |
| `services/system-actions.ts` | OS actions beyond launching: closing apps, volume, media keys, folders, file search, timers and locking. | 330 | 7 | 4 |
| `services/system-stats.ts` | Stage 2: a basic snapshot from `os` (CPU, memory, uptime). | 76 | 3 | 24 |
| `services/task-manager.ts` | Full process list for the Task Manager tab, grouped by app. | 48 | 1 | 1 |
| `services/telemetry.ts` | Live telemetry. | 374 | 2 | 5 |
| `services/timer-service.ts` | Timers & reminders: persisted to userData/timers.json so they survive restarts. | 187 | 4 | 9 |
| `services/toolbox.ts` | Assorted local abilities for Claude: tidy a folder (with undo), search inside documents, check Minecraft mods, optimisation tips and a quick benchmark. | 523 | 1 | 1 |
| `services/usage-tracker.ts` | Records what Claude costs, per day and per feature (userData/usage.json), and warns once when the month passes 80% and 100% of the user's limit. | 146 | 2 | 4 |
| `services/vortex-sync.ts` | Keeping Vortex in step with Alton, through Vortex's own command line (Vortex.exe --get / --set), only while Vortex and the game are closed, after backing up Vortex's state: - mo… | 771 | 1 | 0 |
| `services/wallpapers.ts` | Windows desktop wallpapers: list the user's previous ones (and Windows' own) with previews, and set one when the user taps it in Settings › Appearance. | 86 | 1 | 1 |
| `services/weather.ts` | Weather from Open-Meteo: place search (geocoding) and forecast. | 224 | 2 | 1 |
| `services/whisper.ts` | Local speech-to-text with Whisper (Transformers.js + onnxruntime on the CPU). | 181 | 1 | 1 |
| `services/win-processes.ts` | Fast per-app CPU on Windows. | 102 | 2 | 2 |
| `services/zip.ts` | A tiny read-only zip reader (mod .jar files): list entries and read one, using Node's zlib. | 63 | 1 | 0 |
| `tray.ts` | System-tray icon: click toggles the window; menu has Show/Hide, compact, mute, settings, quit. | 110 | 1 | 0 |
| `window-state.ts` | Returns saved bounds if they are still on a connected display; otherwise null (centre). | 69 | 2 | 3 |

## src/renderer: PC app: the window (React UI)

| File | What it does | Lines | Used by | Tests |
| --- | --- | ---: | ---: | ---: |
| `App.tsx` | — | 260 | 1 | 0 |
| `components/core/avatarKit.ts` | Shared bits for the avatars: moods (pleased / confused), the user's motion setting, and colour helpers. | 80 | 10 | 10 |
| `components/core/bgMotion.ts` | Moving backgrounds: a light canvas layer over the painted (still) background. | 353 | 2 | 2 |
| `components/core/BootSequence.tsx` | Should the boot sequence play? | 154 | 2 | 1 |
| `components/core/codeRing.ts` | Draws the avatar on the canvas until the returned function is called. | 299 | 2 | 1 |
| `components/core/CoreCanvas.tsx` | — | 60 | 1 | 1 |
| `components/core/CoreCode.tsx` | — | 44 | 1 | 1 |
| `components/core/CoreDisplay.tsx` | The central core: canvas rings + HTML readout + SVG leader lines. | 302 | 3 | 1 |
| `components/core/CoreEngine.tsx` | React wrapper for the canvas engines (wave, swarm, orb, head). | 52 | 1 | 1 |
| `components/core/CoreFace.tsx` | — | 53 | 1 | 1 |
| `components/core/CoreSphere.tsx` | — | 47 | 1 | 1 |
| `components/core/DevStateSwitcher.tsx` | Development-only: force the assistant state to review the core's motion. | 76 | 1 | 0 |
| `components/core/engines.ts` | Four more avatars, drawn on canvas without React (so the phone app can use them too): a sound-wave line, a particle swarm, a liquid orb and a 3D wireframe head. | 353 | 2 | 1 |
| `components/core/face.ts` | Draws the avatar on the canvas until the returned function is called. | 363 | 2 | 1 |
| `components/core/geometry.ts` | Polar helpers. | 14 | 1 | 1 |
| `components/core/motion.ts` | Pure motion model for the core. | 88 | 2 | 9 |
| `components/core/rings.ts` | The classic rings, drawn until the returned function is called (framework-free). | 352 | 2 | 1 |
| `components/core/spaceArt.ts` | Realistic space backgrounds, painted once onto a canvas (no animation, so no battery cost): stars with real colours and brightness spread, noise-based nebulae, shaded planets wi… | 869 | 2 | 1 |
| `components/core/sphere.ts` | Draws the avatar on the canvas until the returned function is called. | 377 | 2 | 1 |
| `components/hud/AgentPanel.tsx` | Agent Mode card (bottom right): the task, progress, Stop, and its questions. | 202 | 1 | 0 |
| `components/hud/Ambient.tsx` | Weather and seasons behind the HUD: rain or snow falling, frost on the edges when it's cold, a warm glow around sunset, and snow all through December. | 156 | 1 | 0 |
| `components/hud/ApprovalCards.tsx` | "yes"/"no" typed or said while a card is waiting answers the oldest one. | 78 | 2 | 8 |
| `components/hud/Background.tsx` | Grid + vignette (CSS) and a sparse drifting particle field (canvas). | 171 | 2 | 1 |
| `components/hud/CompactView.tsx` | The 420×120 always-on-top pill: core + one-line status + command input. | 172 | 1 | 0 |
| `components/hud/DesktopWidget.tsx` | The desktop widget window (#widget): see-through, clicks pass through except on tiles. | 661 | 2 | 2 |
| `components/hud/DownloadChip.tsx` | "⬇ Download 45% · 32 MB/s" in the top bar while download mode is on; click to end it. | 46 | 1 | 1 |
| `components/hud/DropZone.tsx` | Drag files anywhere onto ARC to attach them to the next message. | 54 | 1 | 0 |
| `components/hud/GamingChip.tsx` | "🎮 Gaming" in the top bar while gaming mode is on; click to end it. | 20 | 1 | 1 |
| `components/hud/OpenMicChip.tsx` | "MIC ON" in the top bar while open mic is listening; click to switch it off. | 21 | 1 | 1 |
| `components/hud/Palette.tsx` | — | 55 | 1 | 1 |
| `components/hud/RingingBanner.tsx` | "Time's up" banner over every tab, with Dismiss (focused, so Enter works) and Snooze. | 73 | 2 | 0 |
| `components/hud/Screensaver.tsx` | Main → "show/hide the screensaver" (detail: boolean). | 86 | 1 | 0 |
| `components/hud/SetupGuide.tsx` | Settings › Advanced › Run setup again. | 324 | 2 | 1 |
| `components/hud/SpendChip.tsx` | Claude spending this month in the top bar, with a bar towards the monthly limit. | 90 | 1 | 1 |
| `components/hud/StatusBar.tsx` | — | 55 | 1 | 0 |
| `components/hud/SuggestionToast.tsx` | Alton speaks up (Settings › General › Offer help unprompted). | 78 | 1 | 0 |
| `components/hud/TabBar.tsx` | Ctrl/Cmd+1…9 jumps to a section from anywhere. | 48 | 1 | 1 |
| `components/hud/TimerChip.tsx` | Next timer's countdown beside the clock, visible from every tab. | 45 | 2 | 1 |
| `components/hud/TopBar.tsx` | — | 97 | 1 | 1 |
| `components/hud/UpdateChip.tsx` | "Update ready" in the top bar once a new version has downloaded. | 19 | 1 | 1 |
| `components/hud/WindowControls.tsx` | — | 54 | 2 | 1 |
| `components/input/CommandInput.tsx` | Clipboard shortcut: show the saved prompts for the copied text (detail = the text). | 369 | 3 | 2 |
| `components/input/slashCommands.ts` | A saved prompt as a slash command. | 157 | 2 | 3 |
| `components/input/SlashPalette.tsx` | — | 48 | 1 | 2 |
| `components/panels/ActivityLogPanel.tsx` | — | 51 | 1 | 1 |
| `components/panels/AgendaPanel.tsx` | "in 25 min", "in 2h 05m", "in 3 days". | 148 | 2 | 4 |
| `components/panels/Chip.tsx` | — | 37 | 24 | 13 |
| `components/panels/CleanupPanel.tsx` | A scan run elsewhere ("free up space" by voice) shows here when the tab opens. | 254 | 2 | 8 |
| `components/panels/ClipboardPanel.tsx` | Recent copies: click one to copy it again. | 125 | 1 | 0 |
| `components/panels/GoalsPanel.tsx` | Long-term goals with progress bars. | 91 | 1 | 0 |
| `components/panels/Icon.tsx` | — | 57 | 2 | 0 |
| `components/panels/InboxPanel.tsx` | Newest messages from the connected email account (read-only). | 81 | 1 | 1 |
| `components/panels/NowPlayingPanel.tsx` | What's playing in Spotify / a browser / any media app, with transport buttons. | 67 | 1 | 1 |
| `components/panels/Panel.tsx` | Parent container that staggers its Panels in by 60ms. | 51 | 23 | 13 |
| `components/panels/RingGauge.tsx` | Thin segmented arc gauge (270° sweep) with a centred readout. | 82 | 2 | 0 |
| `components/panels/SegmentBar.tsx` | Segmented HUD bar. | 41 | 6 | 1 |
| `components/panels/ShiftsPanel.tsx` | Work shifts synced from the phone app: what's next, and hours this week. | 82 | 1 | 1 |
| `components/panels/Sparkline.tsx` | Responsive SVG line chart; stroke width stays crisp at any size. | 100 | 3 | 1 |
| `components/panels/Stat.tsx` | Small label-over-value readout used in panel stat rows. | 34 | 6 | 1 |
| `components/panels/TimersPanel.tsx` | Live countdowns with +5 / cancel, ringing rows with Dismiss / Snooze, and quick-start. | 197 | 1 | 1 |
| `components/panels/WeekView.tsx` | Your week at a glance: shifts as bars on a timeline, plus hours per week. | 75 | 1 | 1 |
| `components/settings/AiSection.tsx` | Provider, model and API key. | 280 | 1 | 1 |
| `components/settings/CalendarSection.tsx` | Connect a calendar by its private iCal address (stored encrypted in main). | 135 | 1 | 1 |
| `components/settings/controls.tsx` | The settings search text; rows that don't match hide themselves. | 221 | 18 | 1 |
| `components/settings/DeskSection.tsx` | Settings › Appearance › Desktop & taskbar: the widget (with a live preview) and the taskbar features. | 289 | 1 | 1 |
| `components/settings/DiscordSection.tsx` | Discord: a channel webhook, so Alton can post messages you approve. | 61 | 1 | 1 |
| `components/settings/EmailSection.tsx` | Any email account over IMAP (read-only, stored encrypted). | 119 | 1 | 1 |
| `components/settings/GamingTab.tsx` | — | 277 | 1 | 1 |
| `components/settings/HotkeyRecorder.tsx` | Display form: "CommandOrControl+Space" → "Ctrl + Space". | 104 | 1 | 2 |
| `components/settings/OtherTabs.tsx` | Screen, clipboard and health awareness; initiative, learning and Agent Mode. | 1205 | 1 | 1 |
| `components/settings/PersonalityTab.tsx` | — | 219 | 1 | 1 |
| `components/settings/PhoneMsgsSection.tsx` | Settings › Connections › Phone messages: reading the phone's messages aloud on the PC. | 63 | 1 | 1 |
| `components/settings/PrivacyTab.tsx` | Privacy & permissions: everything Alton can see or do, in one place, plus what it did. | 647 | 2 | 1 |
| `components/settings/PromptsSection.tsx` | Settings › Smart › Saved prompts: your own slash commands. | 138 | 1 | 1 |
| `components/settings/QrCode.tsx` | A QR code drawn as SVG squares (no HTML injection). | 40 | 2 | 1 |
| `components/settings/SectionsTab.tsx` | Settings › Sections: every part of Alton, one tap away at any window size. | 64 | 1 | 1 |
| `components/settings/SettingsPanel.tsx` | Settings window: a page list on the left (with search across every setting), the page on the right. | 374 | 1 | 1 |
| `components/settings/SmartHomeSection.tsx` | Smart home: a SmartThings personal access token, so Alton can control lights, plugs, heating… | 61 | 1 | 1 |
| `components/settings/SpendingSection.tsx` | Estimated Claude spending (from the token counts on each reply) and a monthly limit. | 151 | 1 | 1 |
| `components/settings/UpdatesSection.tsx` | — | 83 | 1 | 1 |
| `components/settings/VoiceSection.tsx` | Who speaks (Windows voice or Fish Audio) and the local Whisper mic. | 346 | 1 | 1 |
| `components/settings/VoiceTraining.tsx` | Voice training: read phrases out loud; whatever the speech model gets wrong is learnt as a correction ("necklion" → "Lunar Client") and fixed in everything you say from then on. | 214 | 1 | 1 |
| `components/tabs/AppsTab.tsx` | — | 386 | 1 | 0 |
| `components/tabs/ChatTab.tsx` | — | 309 | 1 | 0 |
| `components/tabs/Columns.tsx` | The 3 / 6 / 3 HUD grid. | 34 | 9 | 3 |
| `components/tabs/MinecraftTab.tsx` | Minecraft tab: Lunar Client / .minecraft mods, problems, Modrinth updates and fixes. | 316 | 1 | 1 |
| `components/tabs/ModsTab.tsx` | Mods tab: Cyberpunk 2077 mods from Vortex, updates from Nexus Mods. | 1192 | 1 | 1 |
| `components/tabs/NetworkTab.tsx` | — | 250 | 1 | 0 |
| `components/tabs/NotesTab.tsx` | — | 428 | 1 | 0 |
| `components/tabs/OverviewTab.tsx` | Overview panels that can be hidden (Settings › Appearance › Dashboard). | 292 | 2 | 1 |
| `components/tabs/registry.ts` | — | 37 | 4 | 2 |
| `components/tabs/RoutinesTab.tsx` | — | 674 | 1 | 0 |
| `components/tabs/StorageTab.tsx` | — | 184 | 1 | 0 |
| `components/tabs/SystemTab.tsx` | — | 275 | 1 | 0 |
| `components/tabs/TasksTab.tsx` | — | 440 | 1 | 0 |
| `components/transcript/CommandCard.tsx` | Inline transcript card for an action ARC runs: "▸ LAUNCHING · Visual Studio Code". | 123 | 1 | 3 |
| `components/transcript/ConsolePanel.tsx` | — | 69 | 1 | 1 |
| `components/transcript/JourneyMapCard.tsx` | A small glowing route map for "how long to get to…": the route on a dark grid, home and destination marked, with the time to allow. | 103 | 1 | 3 |
| `components/transcript/Markdown.tsx` | ARC's replies: Markdown (no raw HTML), HUD-styled, links open in the browser. | 106 | 1 | 3 |
| `components/transcript/Transcript.tsx` | Put text in the message box (Edit on your last message). | 360 | 4 | 3 |
| `components/transcript/Typewriter.tsx` | Reveals streamed text at ~20ms/char. | 71 | 2 | 3 |
| `components/weather/PlaceSearch.tsx` | Town search → pick a result → saved as settings.weatherPlace (only its coordinates leave the PC). | 89 | 2 | 1 |
| `components/weather/WeatherChip.tsx` | "☁ 9°" beside the clock; hidden until a town is set and a reading exists. | 25 | 1 | 1 |
| `components/weather/WeatherIcon.tsx` | — | 43 | 3 | 3 |
| `components/weather/WeatherPanel.tsx` | Live weather for the saved town (Open-Meteo), with an inline town search when none is set. | 166 | 1 | 1 |
| `emergency.ts` | "Stop everything": Agent Mode, a running routine, speech, listening and open mic. | 17 | 2 | 8 |
| `env.d.ts` | / <reference types="vite/client" /> | 11 | 0 | 0 |
| `hooks/useAppCommands.ts` | Handles requests from the main process (global hotkey, tray menu). | 174 | 2 | 2 |
| `hooks/useAvatarLife.ts` | Keeps the avatars alive: movement setting, music pulsing (only while music plays), and moods: pleased when an action or Agent Mode task works, confused when it didn't follow. | 54 | 1 | 0 |
| `hooks/useClock.ts` | Current time, re-rendering every `intervalMs`. | 12 | 9 | 7 |
| `hooks/useElementSize.ts` | — | 19 | 1 | 1 |
| `hooks/useFakeAudio.ts` | Speech-like amplitude from layered sines, so `listening` and `speaking` look alive before real audio exists. | 38 | 1 | 1 |
| `hooks/useGreeting.ts` | Header salutation for the current time of day (the personality adds the title). | 20 | 1 | 2 |
| `hooks/usePersona.ts` | The active personality plus how it addresses you ("sir", your first name, or nothing). | 9 | 2 | 2 |
| `hooks/usePoll.ts` | Fetch now and then every `ms` while mounted (i.e. | 25 | 1 | 0 |
| `hooks/useReducedMotion.ts` | True when motion should be reduced: the Settings override wins, else the OS preference. | 19 | 7 | 4 |
| `hooks/useTelemetry.ts` | Feeds systemStore from the main process: static machine info once, then live stats every ~2s (main pauses them while the window is hidden). | 22 | 1 | 0 |
| `hooks/useTween.ts` | Eases a number toward `target` so telemetry values glide instead of jumping. | 50 | 6 | 2 |
| `hooks/useWindowState.ts` | Tracks maximised / compact state (title-bar glyph, shell radius, compact layout). | 18 | 1 | 0 |
| `lib/attachments.ts` | A file ready to send (pictures shrunk), or a plain reason it can't be. | 72 | 2 | 8 |
| `lib/format.ts` | Threshold tone for a 0–100 load/usage value. | 42 | 12 | 9 |
| `main.tsx` | — | 34 | 0 | 0 |
| `mocks/dashboard.ts` | Sample data for panels whose real sources need an online service or account access (calendar) or haven't been built yet (routine execution). | 106 | 0 | 0 |
| `mocks/telemetry.ts` | Mock telemetry (SystemStats-shaped). | 87 | 0 | 1 |
| `session.ts` | — | 72 | 1 | 1 |
| `stores/agentStore.ts` | Keep the store in step with main, and narrate starts, questions and endings. | 79 | 4 | 9 |
| `stores/appsStore.ts` | Renderer view of userData/apps.json (main owns the file). | 53 | 3 | 8 |
| `stores/assistantStore.ts` | Non-reactive read for render loops (no React re-render per frame). | 62 | 14 | 9 |
| `stores/calendarStore.ts` | `remind(text)`: a heads-up before an event (shown and spoken like ARC's other lines). | 40 | 3 | 4 |
| `stores/chatsStore.ts` | The saved-chats list (main owns it; this mirrors it). | 16 | 6 | 8 |
| `stores/clipboardStore.ts` | `alert(text)`: a PC health heads-up, shown (and spoken) as the assistant's line. | 16 | 2 | 0 |
| `stores/composerStore.ts` | Files and pictures waiting to be sent with the next message. | 36 | 2 | 2 |
| `stores/conversationStore.ts` | The active personality and how it addresses you, read outside React. | 771 | 24 | 8 |
| `stores/emailStore.ts` | — | 17 | 3 | 1 |
| `stores/gamingStore.ts` | Gaming mode is on and ARC should stay silent (no speech, sounds or wake word). | 19 | 7 | 11 |
| `stores/mediaStore.ts` | — | 10 | 3 | 1 |
| `stores/notesStore.ts` | — | 18 | 3 | 0 |
| `stores/routinesStore.ts` | Mirror of main's RoutineService. | 69 | 3 | 8 |
| `stores/settingsStore.ts` | Keep in sync with changes made elsewhere (tray menu, main process). | 29 | 46 | 12 |
| `stores/systemStore.ts` | — | 45 | 11 | 9 |
| `stores/timersStore.ts` | Mirror of main's TimerService (main owns the clock and persistence). | 50 | 4 | 3 |
| `stores/uiStore.ts` | — | 56 | 21 | 11 |
| `stores/updatesStore.ts` | — | 17 | 3 | 2 |
| `stores/voiceStore.ts` | — | 23 | 8 | 8 |
| `stores/weatherStore.ts` | Mirror of main's WeatherService (main fetches, caches and refreshes every 15 min). | 28 | 5 | 2 |
| `themes/themes.ts` | Every themeable token. | 214 | 5 | 4 |
| `voice/alarm.ts` | Timer alarm: a bright two-tone chime repeating every ~1.4 s while any timer is ringing, for at most two minutes. | 62 | 2 | 1 |
| `voice/arcActions.ts` | Carry out a command for ARC itself; the message is what ARC says back. | 139 | 1 | 8 |
| `voice/fishSpeech.ts` | Plays replies in the Fish Audio voice: clips are fetched one sentence-group ahead of playback, so speech starts after the first short clip arrives. | 154 | 1 | 8 |
| `voice/mic.ts` | Decides when the user has finished talking, from per-frame loudness (RMS). | 110 | 3 | 11 |
| `voice/musicLevel.ts` | The level of whatever the PC is playing (Spotify, YouTube…), for avatars that pulse to music. | 56 | 2 | 1 |
| `voice/providers.ts` | The Windows (Web Speech) voice. | 72 | 2 | 8 |
| `voice/sfx.ts` | Sound effects synthesised with Web Audio: no audio files to ship or license. | 73 | 6 | 11 |
| `voice/useSfx.ts` | Sound-effect hook (mute via Settings › Voice › Sound effects). | 7 | 0 | 0 |
| `voice/useSpeechInput.ts` | Mic button: click to talk (stops when you pause), or hold and release to send. | 167 | 4 | 8 |
| `voice/useSpeechOutput.ts` | Stop whatever ARC is saying (e.g. | 125 | 6 | 8 |
| `voice/useWakeWord.ts` | A request was just spoken (push-to-talk counts too). | 216 | 5 | 8 |
| `voice/wakeWord.ts` | Spellings Whisper may use for the assistant's name ("ARC" → arc, ark, a r c). | 182 | 1 | 10 |

## src/shared: Shared logic (pure, tested)

| File | What it does | Lines | Used by | Tests |
| --- | --- | ---: | ---: | ---: |
| `agent.ts` | Agent Mode: Alton operates the PC (screen, mouse, keyboard) to finish a task. | 319 | 8 | 23 |
| `ambient.ts` | The HUD's ambient look: weather you can see, colours that follow the time of day, and seasonal touches. | 53 | 2 | 1 |
| `arcCommands.ts` | Commands that control ARC itself ("new chat", "open notes", "start gaming mode"…). | 207 | 3 | 28 |
| `attachments.ts` | Files and pictures added to a chat message. | 57 | 6 | 70 |
| `audit.ts` | One entry in Alton's action history (Settings › Privacy). | 9 | 3 | 23 |
| `auto-docs.ts` | Automatic documentation (Phase 3, item 8): Alton writes its own docs from its code, so they never drift. | 105 | 1 | 2 |
| `backdrops.ts` | Backgrounds for the PC (and their ids, shared with the phone): space scenes painted by spaceArt.ts over CSS (src/shared/space-backdrops.css), and the phone's original CSS backgr… | 36 | 5 | 70 |
| `brain.ts` | The central engine for each message: one place that works out how to answer it, from everything Alton knows. | 40 | 2 | 20 |
| `calendar.ts` | Calendar: read-only, from a calendar's private iCal address (Google Calendar's "Secret address in iCal format"). | 101 | 13 | 47 |
| `catchup.ts` | "While you were away": a short catch-up when the PC starts, wakes or is unlocked (and on the phone after 30+ minutes). | 38 | 1 | 1 |
| `chats.ts` | Saved conversations ("chats"), like ChatGPT's sidebar. | 80 | 10 | 70 |
| `cleanup.ts` | "Free up space": known-safe places to clear, sized first, cleared only when the user ticks them and confirms. | 69 | 4 | 20 |
| `clipboard.ts` | Recent copied text (kept in memory only; cleared when ARC quits). | 72 | 5 | 22 |
| `code-map.ts` | Source code analysis (Phase 3, item 2): a map of Alton's own code from its files, so it can answer "where is X done?", "what uses this?", "what would a change here affect?", "wh… | 186 | 2 | 8 |
| `commands.ts` | Command pipeline contracts: AI raw intent -> canonIntent() -> CanonicalCommand -> executor -> CommandResult. | 276 | 15 | 70 |
| `confidence.ts` | Knowing when an answer needs checking: questions about facts that change (prices, opening times, "latest", news, results, release dates, delays…) get a note to look them up firs… | 49 | 4 | 76 |
| `context.ts` | Alton's one picture of what's going on right now, built from everything it already knows (the app in front, gaming, music, the next calendar event, unread email, timers, today's… | 78 | 1 | 1 |
| `cpcrash.ts` | Cyberpunk crashes while playing: reads the crash reports AppearanceRuntimePlugin writes (red4ext\plugins\AppearanceRuntimePlugin\Logs\crash-*.txt: where it crashed and which mod… | 268 | 2 | 22 |
| `cpdeps.ts` | Cyberpunk mod dependencies: what each installed mod needs (Nexus Mods' own "Requirements" list, the one Vortex's health check reads) and which of those aren't installed. | 179 | 2 | 20 |
| `cpfix.ts` | Fixing Cyberpunk launch problems by itself: what to do about a crashing RED4ext plugin or a failing REDmod deploy, and editing RED4ext's ignore list. | 147 | 2 | 20 |
| `cplaunch.ts` | "Why won't Cyberpunk start?": reads RED4ext's launch logs (one per launch), the plugins' file dates and the redscript log, and says where launches stop, which plugin is older th… | 212 | 3 | 21 |
| `cpmods.ts` | Cyberpunk 2077 mods: what Vortex has installed (from its mod folder names), what Nexus Mods says is newest, and which ones have updates. | 207 | 3 | 20 |
| `cpoutdated.ts` | "Remove outdated mods": Vortex mods with real evidence they don't work on the current game version (not just "old"): RED4ext plugins older than the update, REDmods whose scripts… | 144 | 3 | 20 |
| `cprecommend.ts` | Cyberpunk mod recommendations: Nexus Mods' trending, newly updated and newly added mods, plus the user's tracked mods, minus what's installed, ranked for this user. | 123 | 2 | 20 |
| `desk.ts` | Desktop widget and taskbar: settings, the data the windows show (one snapshot pushed from main), and the pure decisions (layout, snapping, overlay badge, taskbar progress, tray … | 377 | 9 | 76 |
| `dev-roadmap.ts` | Development roadmap management (Phase 3, item 7): Alton reads its own plan (ROADMAP.md in the project: phases with ✅ done / 🔶 part-done / ⬜ to-do items), knows where it's up to… | 99 | 1 | 1 |
| `diagnostics.ts` | Phone health check: the readings from the Android app, turned into plain words and the things worth fixing (with how). | 123 | 2 | 1 |
| `drift.ts` | Noticing changes nobody asked for: a sudden big drop or jump in what's installed in the game folder (e.g. | 51 | 1 | 1 |
| `email.ts` | Email (any provider over IMAP, read-only). | 47 | 10 | 43 |
| `features.ts` | What Alton on the phone can do and where each thing lives, for the Settings search box and for "what can you do?" (the alton_features tool). | 325 | 2 | 4 |
| `gaming.ts` | Gaming mode: spot a running game, then boost and quieten the PC until it closes. | 128 | 7 | 24 |
| `headsups.ts` | Watch heads-ups: notifications the phone app schedules so a paired watch (e.g. | 331 | 1 | 3 |
| `health.ts` | PC health alerts: things worth a heads-up, with cool-downs so they don't nag. | 115 | 2 | 20 |
| `initiative.ts` | Independent initiative: small, rule-based suggestions Alton offers unprompted. | 295 | 5 | 22 |
| `injection.ts` | Spotting instructions hidden in outside content (emails, web pages, documents, files, the clipboard, messages, calendar invites) before it reaches the AI: invisible characters a… | 105 | 3 | 22 |
| `intended.ts` | Intended against actual changes for Alton's own automated jobs (safety gate 2). | 128 | 3 | 8 |
| `ipc.ts` | Single source of truth for renderer <-> main communication. | 1219 | 45 | 19 |
| `knowledge.ts` | Alton's personal knowledge graph: the people, places, projects, things and events the user has mentioned, and how they connect ("Will — shares shifts with — the user", "Alton — … | 171 | 3 | 22 |
| `lights.ts` | PC lighting (RGB): colour names, brightness, and picking devices by name. | 131 | 1 | 2 |
| `loadorder.ts` | Cyberpunk 2077 archive load order. | 172 | 2 | 20 |
| `looks.ts` | Theme accent colours (kept in step with src/renderer/themes/themes.ts), so the PC can tell the phone app how to look. | 71 | 3 | 4 |
| `mail-servers.ts` | Which IMAP server goes with an email address, and how to sign in to it. | 242 | 3 | 2 |
| `mcmods.ts` | Minecraft mods (Lunar Client and .minecraft, Fabric): what each mod jar says about itself (fabric.mod.json), Fabric version ranges, and the problems that stop a modded game: mod… | 226 | 3 | 20 |
| `media.ts` | What's playing (from Windows' media controls: Spotify, browsers, media apps…). | 74 | 8 | 40 |
| `memory-tidy.ts` | Keeping Alton's memories tidy: near-duplicates are merged (the newest wording wins, since it's usually the most up to date), and memories tied to a moment ("tomorrow", "today", … | 107 | 3 | 27 |
| `messages.ts` | Phone messages (from the phone's notifications): how they're read out, grouped and summarised, on the phone and on the PC. | 149 | 7 | 5 |
| `model-pick.ts` | Picking the Claude model for each message: the cheap, fast one for everyday requests, a stronger one (up to the user's chosen ceiling) when the message needs more thought. | 53 | 1 | 21 |
| `money.ts` | Money helpers for the phone app: payslip vs rota, a real take-home rate from past payslips, subscriptions and repeat payments, spending by category, and price watching. | 276 | 1 | 1 |
| `notes.ts` | Lists (shopping, to-do…), quick notes, and things ARC has been asked to remember. | 154 | 11 | 42 |
| `personalities.ts` | Personality is data, not code. | 264 | 14 | 75 |
| `phone.ts` | The phone-only app (works with the PC off): the sync format shared with the PC, and the links that hand an action to the phone's own apps (Messages, WhatsApp, Phone, Mail, Maps,… | 415 | 3 | 6 |
| `preview.ts` | Picture cards for the pages and products a research answer links to. | 44 | 5 | 71 |
| `prompts.ts` | Saved prompts: the user's own slash commands ("/fix", "/summarize"...). | 94 | 5 | 70 |
| `proposals.ts` | Improvement proposals (Phase 3, item 3): Alton suggests changes to itself from what it finds: problems in its own log (shared/self-diagnosis.ts), and the shape of its code (shar… | 119 | 2 | 1 |
| `regression.ts` | Automated regression testing (Phase 3, item 5): each run of Alton's own checks is recorded, test by test, and compared with the run before, so a test that used to pass and now f… | 105 | 2 | 4 |
| `remote-input.ts` | Remote control from the phone: what it can send, checked, and mapped onto the PC's screen. | 63 | 3 | 2 |
| `remote-link.ts` | How a phone reaches Alton's phone server, and whether that link is encrypted. | 42 | 2 | 3 |
| `roadmap.ts` | The user's feature wish-list, seeded once into Notes as the "Alton roadmap" list (ticked = built). | 54 | 1 | 0 |
| `rollback.ts` | Rolling back a broken update: watching the first starts of a new version, and the facts needed to put the previous one back. | 94 | 2 | 1 |
| `routines.ts` | Routines: a named list of steps run in order with one phrase ("work mode") or a click. | 482 | 13 | 40 |
| `sandbox-rules.ts` | What Alton may change in its development copy (Phase 3, item 4). | 74 | 1 | 4 |
| `self-diagnosis.ts` | Self-diagnosis (Phase 3, item 1): Alton reads its own error log and works out what's actually wrong. | 188 | 3 | 2 |
| `session.ts` | Noticing that Alton didn't close properly last time (a power cut, Windows crashing, or Alton itself crashing), and what was interrupted. | 58 | 2 | 1 |
| `settings.ts` | Pure validation for stored settings: unknown keys dropped, wrong types replaced by defaults, so a hand-edited or corrupted settings.json can't break the app. | 288 | 1 | 17 |
| `shiftChart.ts` | Shift charts as SVG markup (shared by the PC and the phone app): a week timeline with each shift as a bar, and hours (and pay) per week. | 147 | 2 | 2 |
| `shiftFit.ts` | Open shifts and trades (e.g. | 112 | 1 | 1 |
| `shifts.ts` | Work shifts read from a screenshot of the user's rota/shift app, turned into calendar entries: one .ics file with every shift (one tap imports them all), plus a Google Calendar … | 578 | 14 | 32 |
| `skills.ts` | Plugin / skill contract. | 29 | 1 | 1 |
| `sleep.ts` | Sleep planner for shift work: when to wind down and be in bed before a shift's alarm, a nap before night shifts, and short gaps between shifts (UK rules give 11 hours' rest). | 134 | 2 | 3 |
| `smartthings.ts` | Smart home through Samsung SmartThings (api.smartthings.com, a personal access token). | 287 | 3 | 20 |
| `spending.ts` | Spending from bank-app notifications ("You spent £4.20 at Tesco"). | 132 | 3 | 2 |
| `tasks.ts` | The built-in Task Manager: processes grouped by app, like Windows Task Manager. | 189 | 4 | 20 |
| `tool-guard.ts` | Prompt-injection protection at the tool and permission level (safety gate 4). | 179 | 3 | 21 |
| `types.ts` | Shared domain types used by main, preload and renderer. | 717 | 71 | 70 |
| `ui-style.ts` | Interface customisation shared by the PC and the phone app: font, glass panels, chat look, tab bar, spacing and motion. | 461 | 6 | 72 |
| `update-health.ts` | Health checks after each start (safety gate 3): not just "it opened", but the key parts working: saved data readable, settings loaded, the app's internal links (IPC) in place, t… | 77 | 2 | 2 |
| `updates.ts` | Automatic updates from the GitHub Releases of the ARC repo. | 24 | 3 | 19 |
| `usage.ts` | Claude spending: what each request cost, from the token counts Anthropic returns. | 210 | 11 | 49 |
| `verify.ts` | Checking a change after making it: what was asked for against what the PC reports now. | 36 | 2 | 3 |
| `vocab.ts` | Helping speech recognition with your voice: a vocabulary hint for Whisper (your words and app names), corrections learnt from voice training ("necklion" → "Lunar Client"), and a… | 163 | 5 | 70 |
| `voice.ts` | Voice: speech-to-text with a local Whisper model (runs on this PC, free) and text-to-speech with Fish Audio (the user's chosen voice) or the Windows voices. | 89 | 12 | 71 |
| `vortex.ts` | Talking to Vortex through its own command line (Vortex.exe --get / --set, used only while Vortex is closed): escaping state paths, reading --get output, and working out file con… | 176 | 1 | 2 |
| `wallpapers.ts` | Windows desktop wallpapers: the ones the user had before (Windows keeps the last few in the registry) and Windows' own. | 50 | 3 | 20 |
| `weather.ts` | Weather types and pure helpers shared by main (fetch/parse) and renderer (display). | 136 | 19 | 76 |

## src/preload: PC app: the bridge between window and main

| File | What it does | Lines | Used by | Tests |
| --- | --- | ---: | ---: | ---: |
| `index.ts` | — | 314 | 0 | 0 |

## phone/src: Phone app

| File | What it does | Lines | Used by | Tests |
| --- | --- | ---: | ---: | ---: |
| `env.d.ts` | Set by the build from package.json. | 9 | 0 | 0 |
| `main.ts` | Alton on the phone, without the PC: talks to Claude directly with the key saved on this phone. | 8381 | 0 | 0 |
| `md.ts` | Tiny, safe Markdown → HTML: everything is escaped first and only known tags are added. | 107 | 1 | 1 |
| `native.ts` | The Android app's native features, with the browser's own as the fallback, so the same phone app works both as a web page and inside the app (Capacitor). | 513 | 1 | 0 |
| `pc.ts` | Talking to the PC's Alton straight from the phone app (over Tailscale HTTPS). | 150 | 1 | 0 |
| `tools.ts` | Phone tools for Claude. | 848 | 1 | 3 |
| `workmap.ts` | A small street map (OpenStreetMap tiles, no library): drag to move, + / − to zoom, tap to put the pin, and the circle Alton watches drawn to scale. | 217 | 1 | 1 |

## scripts

| File | What it does | Lines | Used by | Tests |
| --- | --- | ---: | ---: | ---: |
| `ensure-electron.cjs` | Ensures Electron's binary is downloaded. | 26 | 0 | 0 |
