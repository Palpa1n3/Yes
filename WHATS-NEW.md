# What's new in Alton

The latest changes, newest first, in plain words, with what to try on your PC and phone.
The full plan is in ROADMAP.md.

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
