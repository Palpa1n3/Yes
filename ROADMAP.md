# Roadmap

The queue of features to build next, in order. Work from the top. When an item ships,
move it to **Done** with the commit, and the next one becomes "up next".

Each item gives the user-facing goal, where it plugs in, and what "done" means. Every new
action follows "How to add a command" / "How to add a skill" in the README (synonyms,
risk level, executor or skill, `describeCommand()`, tests).

## Up next

### 1. Reminders at a clock time, and repeating ones

_"Remind me at 5pm to call Mum"_, _"remind me tomorrow at 9 to pay rent"_, _"every Friday at 4 remind me to submit my hours"_.

- Today timers only take a duration. Extend `set_timer` (or add `set_reminder`) to take a time of day and an optional repeat, reusing the day/time parsing in `src/shared/routines.ts`.
- Store in `timers.json` alongside timers; reuse the ring/snooze banner and the "missed while closed" behaviour.
- Show them in the Timers panel as "Today 17:00" rather than a countdown; offer them to Claude as a tool.
- Done: parsing tests for 12/24h, "tomorrow", weekdays, repeat; reminders survive restart.

### 2. Send to my phone

_"Send this to my phone"_, _"text me the shopping list"_, timer alarms and calendar heads-ups also reach the phone when the PC is idle.

- Use [ntfy](https://ntfy.sh) (free, no account; the phone app subscribes to a private topic). Settings › General › Phone: generate a random topic, show a QR code to subscribe, **Send test**.
- New `send_to_phone` action (risk `safe`, text only) and a "Notify my phone" step for routines.
- Optional: forward alarms/heads-ups when the PC has had no input for N minutes.
- Topic stored encrypted like the other secrets (`secret-store.ts`); it is a password in effect.

### 3. Clipboard history

_"What did I copy earlier?"_, _"paste the link I copied an hour ago"_, _"summarise what I just copied"_.

- Main-process watcher on Electron's `clipboard` (text only, last 50 items, in memory by default; opt-in to keep on disk). Skip items that look like passwords/keys (password-manager apps, long random strings).
- A Clipboard panel/palette (`Ctrl+Shift+V` style) to search and re-copy. Claude tool `get_clipboard` (latest item only unless asked).
- The `src/shared/skills.ts` header already names this as an example skill.

### 4. Proactive nudges

ARC speaks up on its own (respecting the personality's proactivity setting and gaming mode):

- Drive over 90%, battery under 15% and unplugged, memory pressure, CPU very hot: once per condition, not repeatedly.
- "You've been at the PC 90 minutes, stretch?" (configurable, off by default).
- An app has been "Not responding" for over 30 s: offer End task.
- Reuse the morning briefing checks; add a Settings › Personality › Nudges section to choose which.

### 5. "What's on my screen?"

_"What does this error mean?"_, _"summarise this page"_, _"what's this word in English?"_.

- `desktopCapturer` screenshot of the active window, sent to Claude as an image. Always asks first (a command card showing a thumbnail of exactly what will be sent), never automatic, disabled with the mock AI.
- Hotkey option: press it, then ask about what's on screen.

### 6. Window control

_"Put Chrome on the left and Spotify on the right"_, _"move this to my other screen"_, _"minimise everything"_.

- New `arrange_window` action: snap left/right, maximise, minimise, move to monitor N, show desktop. Windows-only via a small PowerShell/Win32 helper like `win-processes.ts`.
- Routine step "Arrange windows" so _"work mode"_ can lay out the desk.

### 7. Custom commands

Let people add their own commands without code: in `commands.json`, a phrase plus one of: open a URL with `{query}`, run a script from a chosen folder, or run a routine.

- Scripts only from a folder the user picks, launched without a shell, always confirmed the first time.
- Editor in the Apps tab next to trigger phrases.

### 8. Ask about a file

Drop a PDF, Word doc, text file or image onto ARC (or _"summarise the last thing I downloaded"_) and chat about it.

- Read text locally (pdf.js for PDFs), send to Claude as a document block; size limit and a cost estimate on the card.
- `find_files` results get a "Ask about this" button.

### 9. Evening recap

The counterpart to the morning briefing: what's on tomorrow's calendar, tomorrow's weather, unfinished to-dos, timers still running, and "you played for 2 h 10 m today" from gaming mode.

- A built-in "Wind down" routine step; optional timed run.

### 10. Auto-update

- `electron-updater` against GitHub Releases: check on start and daily, download in the background, "Restart to update" in the tray and top bar.
- Replaces the manual "extract the new zip, run `npm run installer`" steps in the README.

### 11. Home Assistant

_"Turn off the lights"_, _"set the heating to 20"_, routines that include smart-home steps.

- Settings: Home Assistant URL + long-lived token (encrypted). Read the entity list once, let people pick which entities ARC may control.
- `home_control` action; anything that unlocks doors or disarms alarms is `destructive` and always confirmed.

### 12. Backup and restore

- Settings › Advanced › **Export everything** to a single `.zip` (settings, apps, routines, notes, chats; never the encrypted keys), and **Import** on a new PC.

## Ideas (not yet ranked)

- Voice typing into any app (dictate into the focused window).
- Translation mode (speak in one language, ARC replies in another).
- Pomodoro with stats and Windows Focus Assist on during focus blocks.
- Write access to Google Calendar ("add dentist Tuesday at 3") via OAuth.
- Gmail triage: unread count and "anything important?" in the briefing.

## Done

- Timers, weather, voice in/out, routines and briefing, Task Manager, installer, Google Calendar (read), chats and research, notes/lists/memory, now playing, storage cleanup, gaming mode.
