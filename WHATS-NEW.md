# What's new in Alton

The latest changes, newest first, in plain words, with what to try on your PC and phone.
The full plan is in ROADMAP.md.

## 0.87.0: noticing changes nobody asked for

Phase 1, item 7 of 11.

- **Alton watches your Cyberpunk mods for sudden big changes.** Every minute it counts what's in the
  game folder (archive mods, script mods, tweaks, RED4ext plugins, Cyber Engine Tweaks mods). If a
  lot appears or disappears at once and Alton didn't do it, you get a warning saying what changed
  (e.g. "archive mods 303 → 2") and what to check. This is what would have caught Vortex's empty
  "Default" profile last week straight away.
- Alton's own work (Vortex syncs, saving or putting back mods, updates, deploys) doesn't count, so
  you only hear about surprises.
- **If Vortex opens on another game or a different Cyberpunk profile,** Alton now tells you, and
  doesn't deploy until it's back on your usual one.

**What to test:** nothing to do. You should only see a warning if your mods change a lot without
Alton doing it.

## 0.86.0: checking changes actually happened

Phase 1, item 6 of 11.

Alton now checks after it changes something, instead of assuming it worked:

- **Closing an app:** it waits up to 8 seconds and checks the app is really gone. If not, it tells
  you it's still open (it's probably asking you to save something).
- **Volume:** it compares what Windows reports with what you asked for, and says if it differs.
- **Tidying a folder:** it checks every file really moved, and tells you about any that couldn't
  (usually because they're open in another app). They stay where they were.
- **Mod fixes:** switching off a RED4ext plugin is read back from its settings file, and switching
  a Minecraft mod on or off is checked.

**What to test**

1. Open Notepad, type something, then ask Alton to close Notepad. It should say Notepad is still
   open (it's asking about saving) rather than "closed".
2. Ask for a volume level; the reply should match the real volume.

## 0.85.0: carrying on with an interrupted Agent Mode task

Phase 1, item 5 of 11.

- **Agent Mode tasks survive a restart.** While a task runs, Alton saves what it's doing (the task,
  which step it's on, and its last 30 actions). If Alton or the PC restarts mid-task, the Agent Mode
  card shows **"… was cut off by a restart after step N. Carry on?"**
  - **Carry on** starts it again with a note of what was already done. It looks at the screen first
    and skips the steps that are finished.
  - **Dismiss** forgets it.
- A task that finishes, fails or that you stop is cleared, so the card only shows for real
  interruptions.

**What to test**

1. Start an Agent Mode task with a few steps (e.g. "open Notepad and type a shopping list").
2. While it's running, close Alton from Task Manager (End task).
3. Start Alton: the Agent Mode card should offer to carry on. Tap **Carry on** and check it doesn't
   redo what was already done.

## 0.84.0: recovering from crashes and power cuts

Phase 1, item 4 of 11.

- **Alton notices when it didn't close properly.** It now writes a small "I'm alive" note every 30
  seconds and marks a proper quit (including Windows shutting down normally). If the last session
  ended without that, the next start tells you:
  - whether **the PC went off** (power cut, Windows crash, forced restart) or **Alton itself
    stopped**, and roughly when;
  - what was **interrupted**: the Agent Mode task and which step it was on, and any background
    research that didn't finish.
- **The window fixes itself.** If Alton's window crashes, it reloads by itself. If it freezes for
  20 seconds, Alton restarts it. It stops trying after 3 times in 5 minutes, so a broken page can't
  loop.
- Your data files were already checked at every start (0.81), so a power cut mid-save can't leave a
  broken settings or notes file.

**What to test**

1. Start an Agent Mode task, then end Alton with Task Manager › End task. Start Alton again: you
   should see "Alton stopped unexpectedly…" naming the task and its step.
2. Close Alton normally and start it again: no message.
3. Shutting Windows down normally with Alton open should not give the message either.

## 0.83.0: spending limits that act

- Settings › AI › Spending › **At the limit**: pause background work (the default: Agent Mode,
  background research and memory learning stop until next month; chat keeps going), pause
  everything (chat uses the offline model if you have one), or only warn.
- **Each Agent Mode task has its own cap** (about £1 by default). A task that reaches it stops and
  tells you.
- Not counted yet: the phone app's own Claude use (it uses its own key).

**What to test:** set a monthly limit and look at the two new options.

## 0.82.0: going back after a bad update

- If a new version **fails to start properly twice**, Alton reinstalls the previous version (checked
  against its published checksum), puts back your data from just before the update, and won't
  install the broken version again until a newer one comes out.
- Settings › Updates › **Go back to version X** does it by hand (from the next update on).
- Settings › Privacy › Backups marks any backup with a damaged file.
- Phone: Android can only go back by uninstalling, so Settings › This app links to earlier versions.

## 0.81.0: complete backups and easier phone updates

- Backups now cover all of Alton's data, are checked as they're made, keep 7 days plus 4 weekly
  copies, and a copy is made before every update. A damaged data file is put back automatically at
  start-up.
- **Phone updates:** new versions download in the background, are checked (same app, same key) and
  install when you leave Alton. After the first one, Android 12+ installs them with no Install
  screen. Switch: Settings › This app › Update automatically.
