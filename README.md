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
| Overview | Timers, weather, now playing, vitals, core, console, network, drives, agenda, activity log     |
| Chat     | Saved chats (like ChatGPT): new, pin, rename, search, export; research mode with web sources   |
| Notes    | Lists (shopping, to-do…), quick notes, and what ARC remembers about you                        |
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

### Talking naturally

- **Follow-up** (Settings › Voice, on by default with the wake word): after Alton answers something you said, it listens for 8 more seconds, so _"and tomorrow?"_ works without saying the name.
- **Whisper mode**: say _"whisper mode"_ (or Settings › Voice) for quieter, slower speech and no sound effects; _"speak normally"_ to undo.

### More things Alton can do (v0.5)

- **Tidy folders**: _"tidy my downloads"_ moves loose files into Pictures, Documents, Installers… after you approve the plan; _"undo the tidy-up"_ puts them back. Nothing is deleted.
- **Search your documents**: _"find my notes about the router"_ searches inside text and Word files in Documents, Desktop and Downloads.
- **Speed**: _"why is my PC slow?"_ (startup apps, restart, disk space, memory, power plan) and _"run a benchmark"_ (compared with last time).
- **Goals**: Notes › Goals, or _"my goal is to learn Spanish"_, _"I finished unit 3"_. In the morning briefing; Alton nudges you if one stalls.
- **Background research**: _"look into the best budget monitors and tell me later"_; the write-up lands in Notes.
- **Reminders when an app opens**: _"when I open Steam, remind me to update my drivers"_.
- **Minecraft**: _"why does my modpack crash?"_ finds duplicate mods, the crash report and log errors.
- **Spotify / Discord**: _"play something chill on Spotify"_; _"post to Discord: on in 10"_ (add a webhook in Settings › Connections › Discord; every post is approved first).
- **All your monitors**: _"what's on my other screen?"_; Agent Mode works on whichever screen the mouse is on.
- **Agent Mode** now plans first, checks its work, remembers tips about your apps (Notes › Memory › How your apps work) and queues tasks.
- **Alton notices**: error pop-ups, its own errors, USB drives, the internet dropping, apps you always open together (offers a routine), stalled goals. It stays quiet over full-screen apps.
- **Voice**: extra wake words (Settings › Voice), say _"stop"_ to interrupt it mid-sentence, livelier delivery, and _Voice help in game_ (Settings › Gaming).
- **Gaming**: save backups after each session (Settings › Gaming › Open), per-game profiles.
- **Permissions** (Settings › Privacy): for each kind of action choose _Just do it_, _Ask me_ or _Never_. Approvals also appear on the phone companion, which now shows your recent chat.
- **Dashboard** (Settings › Appearance): choose which Overview panels show. **Plugins** (Settings › Advanced): JSON files that add knowledge and routines (no code).
- **Memory**: click a memory to edit it; memories can belong to a project; fixes that worked are remembered ("Problems solved before"). The **Alton roadmap** list in Notes tracks the whole wish-list.
- **Clipboard**: one-click actions on copies (open link, track parcel, map an address, explain code, summarise long text).

### Spending

**Settings › AI › Spending** shows what Claude has cost today and this month (estimated from each reply's size at Anthropic's published prices), a 31-day chart and a breakdown by feature (chat, research, Agent Mode, memory learning). Set a **monthly limit** to be warned at 80% and 100%. The phone-only app tracks its own spending in its Settings. Your Anthropic console shows the exact bill.

### Chat tools

Hover over an answer for **Copy**, **Read aloud** and (on the last one) **Try again**; hover over your last message for **Edit** (it goes back in the box to change and resend). Code blocks have their own **Copy** button. The phone-only app has **Try again**, **Edit**, pinned chats (☆) and **hands-free** mode (the headphones button: Alton answers out loud, then listens again; say "that's all" to stop).

### Saved prompts (your own /commands)

Type `/` in the command line to see them. `/fix teh text` sends your text through the
"fix" prompt; `/fix` on its own uses what you last copied. Starters: `/summarize`, `/fix`,
`/explain`, `/translate`, `/reply`, `/shorter`. Add or edit your own in Settings › Smart
features › Saved prompts (`{text}` marks where the text goes). They sync to the phone app.

### Clipboard actions (Ctrl+Alt+C)

Copy text in any app, press **Ctrl+Alt+C**, and Alton opens with your saved prompts for
that text: pick one with the arrow keys and Enter. Change or turn off the shortcut in
Settings › Hotkeys.

### Focus mode

`/focus` (25 minutes), `/focus 50`, or "focus for 30 minutes". A FOCUS countdown shows at
the top; suggestions and PC health alerts stay quiet until it ends, then you get a
"Focus done" notification. Cancel it like any timer.

### Phone app extras

Type `/` for your saved prompts, the share button sends the whole chat to another app,
and messages written with no signal wait and send themselves when you're back online.

### Shifts to your calendar (phone app)

Web apps can't open or read other apps, so: screenshot your rota in your shift app, tap
**Share › Alton** (or the "Add my shifts to my calendar" button, or the camera button), and
send. Alton reads the shifts (overnight ones end the next morning) and lists them back for
you to check. **Add N shifts to my calendar** puts them all in at once: pick your calendar
app from the share sheet, or open the downloaded `shifts.ics`. There's also a Google
Calendar button per shift. Shifts already added from the phone are skipped next time.
Long-press the Alton icon for an "Add my shifts" shortcut.

### Shift alarms and Alexa (phone app)

Shifts Alton reads from your rota are kept on the phone (People › Shifts, with your hours
this week and next). The evening before a shift, the chat screen shows a **Tomorrow** card:

- **Phone alarm** opens the Clock app with the wake-up time filled in; tap Save. (Android
  doesn't let apps switch on an alarm you already made, so on Samsung this may add a
  second alarm at the same time.)
- **Tell Alexa** makes the phone say "Alexa… set an alarm for 5:45 a.m. tomorrow" out loud,
  so keep it near your Echo with the volume up.

Set the wake-up time in People › Shifts: minutes before a shift, or exact times per start
time like `07:00=05:45, 12:00=10:00`. You can also ask "when am I working this week?",
"how many hours next week?", or "tell Alexa to turn on the bedroom light".

### Pay, travel and backups (phone app)

In People › Shifts, add your hourly pay (and any unpaid break) to see estimated pay for this
week and next, and your travel time to get a "leave by" time on the Tomorrow card. Ask
"how much will I earn this week?" too. Alton mentions your next shift when you say
"brief me". Shifts go to the PC when you sync, so the PC version knows your rota as well.

Settings › Backup saves everything on the phone (not your Claude key) to a file; Restore
brings it back on a new phone or after clearing the browser.

### Code ring avatar

Settings › Appearance › Centre display › **Code ring**: rings of code characters turning
in opposite directions around a glowing core. The characters rewrite themselves (a storm
while thinking), a bright sweep runs round while listening, the rings pulse with the voice
while speaking, amber while acting and red on a fault.

### Shifts on the PC, rota changes, backup reminder

Once you've synced the phone, the Overview tab shows a **Shifts** panel (next shift, the
coming few and hours this week); hide it in Settings › Appearance › Dashboard. When you
share a new rota, Alton tells you what changed: moved shifts, new ones, and ones that
disappeared (delete those from your calendar). The phone reminds you weekly to save a backup.

### Turning the PC off, and Steam updates

Say "shut down the PC", "restart in 10 minutes" or "put the PC to sleep": Alton asks you to
approve, then counts down (1 minute by default) so you can still say **"cancel shutdown"**.
"Shut down when Steam finishes updating" (or "...when Cyberpunk finishes") watches the games
Steam is downloading right now; when they're done you get a 2-minute warning, then the PC
shuts down. "What's Steam downloading?" shows progress. The phone companion has Shut down,
Restart and Cancel shutdown buttons too.

Turning the PC **on** has to come from outside it: use Wake-on-LAN from your phone (phone
app › PC › Wake from phone). Wake-on-LAN must be switched on in the PC's BIOS and network
adapter settings.

### Reading its own code

The app ships with a read-only copy of its source, so you can ask "how does the code ring
work?" or "why isn't X working?" with no setup. Choose your project folder in Settings ›
Advanced › Source folder if you edit the code, so it sees your changes and can run its tests.

### First-run setup

New installs open a five-step guide (name, Claude key, voice, smart features, phone with a QR code). Run it again any time from Settings › Advanced › Setup guide.

### Settings

Settings (the sliders icon, or Ctrl+,) opens a full window: pages on the left (General, AI, Smart features, Connections, Personality, Appearance, Voice, Gaming, Hotkeys, Privacy & safety, Advanced) and a **search box** (Ctrl+F) that finds any setting across every page. Changes save as you go; Esc closes. You can also say _"open privacy settings"_, _"open connections settings"_ and so on.

### Look and themes

Panels have a softer glass look with lit edges and a glow from the top of the screen. Pick a palette with the coloured dots in the top bar (or Settings › Appearance): Cyan, Gold, Crimson, **Sentinel** (dark steel with red eyes, matches the face), **Violet** and Mono.

### The face

The centre of the Overview is an animated face: the eyes glow, blink and follow your mouse, narrow and scan while thinking, the jaw moves with the voice, and it turns amber while acting and red on a fault. Prefer the old rings? **Settings › Appearance › Avatar › Rings**.

### Name, wake word and open mic

- Rename the assistant in **Settings › General › Assistant name** (e.g. **Alton**): the logo, window title, greetings and wake word all follow it.
- **Wake word** (Settings › Voice): start with the name, _"Alton, what's the time?"_. "Hey" is optional, and near-misses like "Elton"/"Alten" still work.
- **Open mic**: press **Ctrl+Alt+M** (Settings › Hotkeys) and everything you say goes to the assistant, no name needed. A green **MIC ON** chip shows; press the shortcut, click the chip, or say _"open mic off"_ to stop. It switches itself off after 5 quiet minutes (Settings › Voice).

### Agent Mode ("handle this for me")

Say or type _"Alton, handle this for me"_ (or _"handle this for me: put the photos on my desktop into a folder called Holiday"_, _"take over and fill in this form"_, _"agent mode: …"_). Alton then uses your **mouse and keyboard** to do it, looking at the screen after each step. Windows only; needs Claude (model in **Settings › AI › Agent Mode model**, Sonnet by default).

- A red **AGENT MODE** banner sits at the top of the screen while it works (it's left out of Alton's own screenshots). **Press Esc anywhere**, click **Stop**, or say _"stop"_ to take back control at once.
- Before paying, buying, sending a message, deleting, changing settings or installing anything, it stops and asks: **Approve** / **Deny** in the card (or say _"yes"_ / _"no"_). It never types passwords or card numbers; it asks you to type them, then press Enter in the card.
- Questions ("which size?") appear in the same card; type or say the answer.
- Limits: 40 steps / 120 mouse-and-key actions per task. It won't press Ctrl+Alt+Del or lock the PC, and treats text on web pages as information, never as orders.
- Cost: each step sends a screenshot, so a task is roughly a few pence (simple) to tens of pence (long).
- **Pause** (button, or say _"pause"_ / _"hold on"_) hands the PC back after the current step; **Resume** or _"carry on"_ continues. The card lists each step as it goes.
- Switch it off in **Settings › Smart features**.

### Emergency stop, privacy and action history

- **Ctrl+Alt+Backspace** anywhere, or say/type _"stop everything"_: stops Agent Mode, a running routine, speech and listening at once.
- **Settings › Privacy**: every permission in one place (screen, clipboard, saved chats, learning, suggestions, Agent Mode) and the **action history**: apps opened, Agent Mode steps, routines run or created, facts learned and suggestions made, with times and whether they worked. Stored on this PC (logs/actions.jsonl); **Clear** empties it.

### Phone-only app (works with the PC off)

A separate version of Alton for your phone that talks to Claude directly, so it works anywhere (mobile data too) with the PC off. It lives in `docs/` (source in `phone/`, rebuilt with `npm run build:phone`) and is served free by **GitHub Pages**.

- **Set up once:** push the project to GitHub, then on GitHub: repository › Settings › Pages › Source: _Deploy from a branch_, Branch **main**, folder **/docs** › Save. After a minute it's at `https://<username>.github.io/<repository>/` (for this project, `https://palpa1n3.github.io/Yes/`; change it in Settings › Connections › Phone app if different). Open it on your phone, add it to the home screen and enter your Claude key (stored only on the phone; set a monthly limit at console.anthropic.com).
- **What it does:** chats (with a list, search and research mode), a real mic button, photos, web search, read-aloud, and phone actions: _"text Mum I'm running late"_, _"WhatsApp Sam…"_, _"call Dad"_, _"email…"_, _"directions to…"_, _"add dentist Friday 3pm to my calendar"_, timers and alarms (Android), share. Each becomes a button that opens the right app with everything filled in; you tap send. It never sends anything by itself.
- **Location and weather:** _"what's the weather here this weekend?"_, _"find a pharmacy near me"_ (asks permission once; your location is only used for that question).
- **Brief me:** a button on the start screen (or the home-screen shortcut) gives today's date, local weather, your lists and a tip.
- **Share into Alton (Android):** in any app, Share › Alton to send a link, text or photo, then ask "summarise this" or "what's this?".
- **Home-screen shortcuts:** long-press the Alton icon for New chat, Talk, Text someone and Brief me.
- **Edit on the phone:** tick off, add (e.g. "Shopping: milk, eggs") and delete list items; add notes; edit or delete memories; rename and pin chats. Your goals and notes come over from the PC. **Send phone chats to PC** takes chats, new memories, notes, new items and ticked/deleted items back to the PC.
- **People:** "Add from my contacts" (Android Chrome) or type names and numbers, so "Mum" means the right person. Unknown names get a "Choose from contacts" button.
- **Sync:** in the PC version on your phone, More › **Update phone app** copies your memories, personality, lists and recent chats (and the PC's address). In the phone app, PC › **Send phone chats to PC** brings chats, new memories and list items back (the PC must be on). The data travels inside the link itself, never through another server.

### Wake the PC from your phone

Settings › Connections › **Wake from phone** shows the PC's network (MAC) address and the one-time setup (network adapter power settings, turn off Fast startup, BIOS if needed). Install a free Wake-on-LAN app (Android "Wake On Lan", iPhone "Mocha WOL") and add the PC. Use **Sleep PC** on the PC page of the phone version to put it to sleep. Away from home, install **Tailscale** on the PC and phone: the full phone version then works over the internet at the PC's Tailscale address.

### Phone companion (the full Alton on your phone)

**Settings › Connections › Phone companion** (off by default). Turn it on and **scan the QR code** with your phone's camera: it opens and pairs by itself. (Or open the address shown and type the 6-digit code.) Settings also shows a QR code for the phone-only app. Add it to your home screen to use it like an app.

- **Chat** like on the PC (and ChatGPT): all your chats in the side menu (search, rename, pin, delete), new and **research** chats, answers that appear as they're written with formatting and sources, **photos** from your camera or gallery, Copy and **Read aloud** (or turn on "Read replies aloud" in More). Talk by tapping the microphone on your phone's keyboard. It's the same Alton: same chats, memory and abilities.
- **Notes**: lists (tick, add, delete), goals with progress, notes and memories.
- **PC**: status, music controls and volume, Agent Mode (start, pause, stop, answer its questions), routines, timers, a **live view of your screen**, Approve/Deny cards, send a file to the PC, Lock PC and Stop everything.

Only home-network addresses are served; each code works once and wrong guesses lock pairing; **Unpair phones** forgets every phone. Windows asks about the firewall the first time: allow **private networks** only. If the phone says the page isn't available, set your Wi-Fi to **Private** in Windows (Settings › Network & internet › your network › Network profile type).

### Offline AI (Ollama)

Install the free Ollama app (ollama.com), run `ollama pull llama3.2` once, then pick the model in **Settings › AI › Local AI**. With AI set to **Offline** Alton chats using that model on your own PC (free, private, no internet). It's also used automatically if Claude can't be reached. It can't take PC actions or search the web; built-in commands still work.

### Games: crashes, performance, installed games

- _"Why did my game crash?"_: Alton reads Windows' crash records (faulting module, error code, unexpected restarts) and explains likely causes and fixes.
- While gaming mode is on, Alton records CPU/GPU load and temperatures; afterwards it tells you how the session ran (and warns if it ran hot or the processor held the graphics card back). Ask _"how did my last game run?"_.
- _"What games have I got?"_, _"launch Cyberpunk"_: Steam and Epic games are found automatically and started through their launcher.

### Backups

Alton's data (settings, notes and memories, routines, apps list, chats) is copied once a day; the last 7 days are kept. **Settings › Privacy › Backups** to back up now or restore one (the app restarts; your current data is backed up first). Keys and passwords aren't copied.

### Routines from plain English

Ask Claude _"make a routine called Work mode that opens Outlook and Teams, sets volume to 30 and says good luck"_ or _"every weekday at 8:30 run my briefing"_. It builds the routine (with its phrases and schedule) in the Routines tab, where you can check, edit or delete it.

### Alton speaks up (suggestions)

With **Offer help unprompted** on (Settings › Smart features), Alton occasionally offers help: an app hogging memory when memory is nearly full (one tap to close it), rain forecast around your next event, an urgent-looking unread email, and around 9:30pm your evening routine or a reminder for tomorrow's first event. At most one every 20 minutes, never twice for the same thing, never in quiet hours (10pm–8am by default), while gaming, during Agent Mode, or when you're away from the PC.

### Self-debugging

Ask _"why isn't the weather working?"_ or _"debug yourself"_: Alton reads its own **error log** (Settings › Advanced › Error log) and, if you point it at the project folder (**Settings › Advanced › Self-debugging: source folder**, the `arc` folder with package.json), its **own code, read-only**. It explains the cause and gives you the exact change to make; it can't edit files itself.

### Seeing your screen

**Settings › Smart features › Let … see your screen** (on by default). ARC keeps one picture of the screen you're using, never of ARC itself, refreshed every few seconds and kept in memory on this PC. Claude looks at it only when a question needs it: _"what's this error?"_, _"which of these should I pick?"_. Paused during gaming mode.

### Files and pictures

Drag files onto ARC, paste a screenshot (Ctrl+V) or click 📎 by the message box: pictures, PDFs (up to 20 MB) and text files (txt, csv, code, logs…). Pictures are shrunk before sending. Claude reads them with your message; the chat keeps a small thumbnail. (Needs Claude: the offline brain can't read files.)

### Clipboard history and PC health alerts

- **Clipboard** (Notes tab): your last 50 copies, to copy again or ask about (_"what did I copy earlier?"_). Memory only, cleared when ARC quits; anything that looks like a password is blurred and never shown to Claude.
- **Health alerts**: a notification (and spoken) when the processor or graphics card runs hot, memory or a drive is nearly full, the battery is low, or the PC hasn't restarted in a week. Each has a cool-down. Both can be turned off in Settings › General.

### Email (Gmail)

1. Turn on 2-Step Verification for your Google account if it isn't (myaccount.google.com › Security).
2. myaccount.google.com › Security › **App passwords** › create one called _ARC_; Google shows 16 letters.
3. ARC › Settings › Connections › Email: your Gmail address and those 16 letters › **Connect**.

ARC opens the inbox **read-only** (nothing is marked as read, sent or deleted) and checks every 5 minutes. The Overview shows an **Inbox** panel, the briefing mentions unread mail, and you can ask _"any new emails?"_ or _"what did Mum's email say?"_. The address and app password are stored encrypted; remove them with **Disconnect** (and you can revoke the app password at Google any time).

### Automatic updates

The installed app checks this project's **GitHub Releases** every few hours, downloads new versions in the background and shows **Update ready** (installs when ARC restarts, or click it). Releases are built by GitHub itself: `.github/workflows/release.yml` runs whenever `package.json`'s version changes on `main`, builds the installer on Windows and publishes it. So to ship an update: bump the version, `git push`, and ARC updates itself a few minutes later. Settings › Advanced › Updates shows the version and a **Check now** button.

### Routines and the morning briefing

- A routine is a list of steps run in order: open or close apps, set the volume, music controls, open a folder or website, search the web, start a timer, say something, wait, give a briefing, or lock the PC.
- Run one by typing or saying its name or one of its phrases (_"work mode"_, _"good morning"_). This runs straight away without using AI credit. You can also press **Run** in the Routines tab, or ask Claude (_"start my focus routine"_).
- Steps go through the same command system as chat, so the same safety rules apply. Closing an app is always a polite close. If a step fails, the rest still run and the Routines tab shows why.
- **Morning briefing**: the time, your weather, running timers, and anything wrong with the PC (drives over 90% full, high memory use, a hot processor, low battery, or no restart for a week). Tick **Run when ARC starts (once a day)** to get it each day in place of the usual greeting.
- **Timed routines:** tick **Run at a set time**, pick a time and the days (weekdays are pre-selected). They run while ARC is open or sitting in the tray; if the PC is off or asleep at that time, that run is skipped.
- Three examples come built in (Morning briefing, Focus mode, Wind down). They're saved in `%APPDATA%\ARC\routines.json`.

### Chats and research

- The **Chat** tab keeps every conversation, grouped Pinned / Today / Yesterday / Previous 7 days / Older. **New chat** starts fresh; hover a chat to pin, rename or delete it; search looks inside messages too. Claude keeps each chat's context separately, and after a restart it's given the chat's earlier messages.
- The console on the Overview always shows the open chat (its name is at the top; **+** starts a new one).
- **Research mode** (the switch at the top of a chat, or **Research** for a new one): Claude searches the web and reads pages, uses the research model (Settings › Advanced, Sonnet by default) and writes fuller answers with headings, lists, tables and **sources** you can click. Web searches cost about 1p each on top of normal usage. Answers have a copy button; **Export** saves the chat as a Markdown file.

- **Picture cards:** under a research answer ARC shows cards for the pages and products it links to (picture, title, shop and price when the page lists one); click one to open it. ARC fetches and shrinks the pictures itself and never contacts addresses on your home network. Some shops (Amazon especially) block automated visits, so their cards may have no picture.

### Commands for ARC itself

Type or say these (they run instantly, without using AI credit):

| Say                                                                                                    | Does                                                          |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| _"new chat"_, _"new research chat"_, _"research the best budget headset"_                              | Starts a chat (the last one asks your question straight away) |
| _"switch to my dinner ideas chat"_, _"pin this chat"_, _"rename this chat to …"_, _"export this chat"_ | Manages chats                                                 |
| _"turn research on"_ / _"research off"_                                                                | Research mode for the open chat                               |
| _"open notes"_, _"show the task manager"_, _"go to storage"_, _"open gaming settings"_                 | Opens tabs and settings                                       |
| _"free up space"_, _"how much space can I free?"_                                                      | Scans and tells you; you press Clear in the Storage tab       |
| _"start gaming mode"_ / _"stop gaming mode"_                                                           | Gaming mode by hand                                           |
| _"pause the music"_, _"next song"_, _"previous track"_                                                 | Media keys                                                    |

With Claude connected, looser wording works too (_"can you show me my lists?"_): Claude has a `control_arc` tool for the same things.

### Notes, lists and memory

- Say or type _"add milk and eggs to my shopping list"_, _"what's on my shopping list?"_, _"tick off milk"_, _"take a note: …"_. Lists and notes are in the **Notes** tab, where you can also tick, add, rename and delete.
- _"Remember that I take my coffee black"_ saves a memory; Claude is given your memories in every chat. _"What do you remember about me?"_, _"forget the coffee thing"_, or delete them in the Notes tab. Memories are stored on your PC and sent to Claude with your messages.
- **Learns as you chat** (Settings › Smart features › Learn about me automatically, needs Claude): a few minutes after a chat goes quiet, a small, cheap model notes any lasting facts you mentioned (your job, people's names, preferences). They show in Notes grouped by kind (About you, People & pets, Likes & preferences, Work & projects) with a **learned** tag; delete any that are wrong. Passwords, codes and card numbers are never kept.
- **Remembers past chats**: _"what was that recipe we talked about last week?"_ — Claude searches all your saved chats.
- The morning briefing mentions what's on your **To-do** list.

### Now playing

When Spotify, a browser tab or any media app is playing, a **Now playing** panel appears on the Overview with the song, artist and previous / play-pause / next buttons. Ask _"what's this song?"_. (It reads Windows' own media controls, so it works with anything that shows up in the Windows volume pop-up.)

### Free up space (Storage tab)

**Find space to free up** sizes: temporary files (older than a day), the Recycle Bin, crash reports, browser caches (logins and history are kept), graphics shader caches, Steam/Epic/Discord caches, and big or old files in Downloads. Tick what to clear, then confirm. Caches and temp files are deleted; Downloads files you pick go to the **Recycle Bin**. Files in use are skipped. For Windows Update leftovers use **Windows Disk Cleanup (system files)**. Claude can't clear anything.

### Gaming mode (Settings › Gaming)

Turn on **Turn on automatically** and ARC watches for games (popular titles, plus anything running from Steam, Epic, Xbox, Battle.net, Riot, EA, Ubisoft, GOG or CurseForge/Minecraft folders). While you play: **High performance** power plan, the apps you list are closed politely, and ARC stays quiet (no speech, sounds or wake word; timer alarms still ring). When the game has closed, the power plan is put back and those apps reopen. A **Gaming** chip shows in the top bar; click it to end gaming mode. If a game isn't spotted, add its process name (from the Tasks tab) under **Extra games**.

### Task Manager (Tasks tab)

- Every running app and process, grouped like Windows Task Manager (**Apps**, **Background processes**, **Windows processes**), updated every 2 seconds. Click CPU, Memory or Name to sort; search by name.
- **End task** asks the app to close, like clicking × (it can still ask you to save). If it doesn't close, ARC offers **Force end**, which only happens after you confirm, and unsaved work in that app is lost.
- Windows' own processes and ARC itself show a lock and can't be ended. Claude can never force-end anything.
- Frozen apps show **Not responding** in red, with their End task button always visible.

### Calendar (Google)

- **Settings › Connections › Calendar.** In Google Calendar on the web, open ⚙ **Settings**, click your calendar under **Settings for my calendars**, open **Integrate calendar**, and copy **Secret address in iCal format**. Paste it into ARC and press **Connect**.
- That address works like a password (anyone with it can read your calendar), so ARC stores it encrypted and never shows it again. Don't paste it into chats. If it ever leaks, use **Reset** next to it in Google Calendar and connect the new one.
- ARC can read the calendar but can't change it. It refreshes every 10 minutes and shows today and tomorrow in the **Agenda** panel (Overview), with a countdown to the next event.
- The morning briefing includes your day, and you can ask _"what's on today?"_ or _"what have I got tomorrow?"_.
- **Heads-up before events** (default 10 minutes): a Windows notification, and ARC says it.

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
| `chats\`            | Your saved chats (`index.json` + one file per chat). Turn off in Settings › General         |
| `notes.json`        | Lists, notes and memories                                                                   |
| `routines.json`     | Your routines                                                                               |
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
