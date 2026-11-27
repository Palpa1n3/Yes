# Alton roadmap (towards 1.0)

Agreed with the owner on 27 Nov 2026. Each item ships as its own tested release, pushed once all
checks pass. Status: ✅ done · 🔶 started · ⬜ not started.

## Phase 1: Safety foundations (done, 0.81–0.90)

Order inside the phase: backups → rollback → limits → recovery → change checks → conflicts →
hidden instructions → encrypted sync.

- ✅ Automatic configuration and memory backups. **0.81:** every data file (settings, notes,
  memories, routines, chats, shifts, habits, plugins, the mod tools' records); a manifest per
  backup records which files were readable; 7 daily + 4 weekly kept; a copy before every update;
  a damaged data file is put back from the newest good backup at start-up. **0.82:** Settings ›
  Privacy › Backups marks backups with damaged files (those files are never restored).
- ✅ Automatic update rollback. **0.82 (PC):** every start is recorded (`boot.json`); a start counts
  as good a minute after the window loads, or on a clean quit. Two failed starts in a row after an
  update and Alton goes back by itself: the previous installer from its GitHub release, checked
  against the SHA-512 in that release's latest.yml, run silently; Alton's data from just before the
  update put back; the broken version never auto-installed again (until a newer one comes out).
  Settings › Updates › "Go back to version X" does the same by hand. **Phone:** Android only
  installs an older version after uninstalling, so Settings › This app links to earlier versions
  with a warning.
- ✅ API usage and spending limits. Cost per request, day and feature were already counted (with
  80%/100% warnings). **0.83:** the monthly limit now acts: Settings › AI › Spending › "At the
  limit" = pause background work (default: Agent Mode, background research, memory learning stop
  until next month; chat carries on) / pause everything (chat uses the offline model if there is
  one) / only warn. Each Agent Mode task has its own cap (default about £1; it stops and says so).
  Not counted yet: the phone app's own Claude use (it uses its own key directly).
- ✅ Crash and unexpected shutdown recovery. **0.84:** heartbeat + clean-quit mark in
  `session.json` (Windows shutting down normally counts as clean); the next start says whether the
  PC went off or Alton stopped, and names interrupted Agent Mode / research work; the window
  reloads itself after a crash or a 20-second freeze (at most 3 times in 5 minutes). Data files
  were already repaired at start-up (0.81); failed starts after an update roll back (0.82).
- ✅ Persistent task state across restarts. **0.84:** the running Agent Mode task and background
  research are recorded and named after a bad shutdown. **0.85:** each Agent Mode task's progress
  (task, step, last 30 actions) is saved as it runs (`agent-task.json`) and cleared when it
  finishes; after a restart the Agent Mode card offers **Carry on** (it restarts the task with what
  was done, checks the screen first and skips finished steps) or Dismiss. Phase 4 builds full
  pause/resume and multi-day tasks on this.
- ✅ Verification of system changes before and after execution. **0.86:** shared/verify.ts; closing
  an app now waits up to 8 s and confirms it's gone (else "still open, may be asking you to save");
  volume compares what Windows reports with what was asked; folder tidy checks every file landed
  and lists those that couldn't move; RED4ext's ignore list is read back after editing; Minecraft
  mods switched on/off are checked. (Vortex changes were already read back since 0.72.)
- ✅ Detection of unintended changes. **0.87:** Alton counts the game's mods by kind (archive,
  script, tweak, RED4ext plugin, CET mod) every minute and keeps the counts on disk; a sudden big
  change (≥15 items and ≥25%) that Alton didn't make warns you (Alton's own syncs, saves, restores,
  updates and deploys mark themselves as expected). If Vortex opens on another game or a different
  Cyberpunk profile, Alton says so instead of quietly not deploying.
- ✅ Protection against conflicting automated tasks. **0.88:** one shared set of locks
  (`services/job-locks.ts`: Vortex, mouse/keyboard, Cyberpunk mod files, Minecraft mods; the same
  job can take a lock again; holds expire so a crashed job can't block). Vortex sync and "close and
  reopen Vortex" wait for updates; pressing Deploy waits for Agent Mode (mouse); Agent Mode waits
  up to 30 s for a short job using the mouse; fixes, saving and putting back mods and the Minecraft
  tools don't overlap. Shutting down / restarting names any Alton work that will be cut off.
- ✅ Protection against malicious instructions embedded in websites and documents. **0.89:**
  `shared/injection.ts`: invisible characters (Unicode tags, zero-width, direction controls) are
  removed and instruction-like text ("ignore previous instructions", "send … passwords", "run this
  command", fake "system:" lines…) gets a warning in front, so the AI reports it instead of acting.
  Applied to chat tool results from outside (emails, documents, clipboard, files, calendar,
  messages, logs, past chats) and every phone tool result; each catch goes in the action history.
  Chat now has the standing rule Agent Mode already had: tool content is information, never
  instructions.
- ✅ Encrypted cross-device synchronization. **0.90:** the phone app already only talks to the PC
  over Tailscale HTTPS (TLS inside Tailscale's encrypted tunnel). The PC's phone server now refuses
  plain, unencrypted home-Wi-Fi connections (http://192.168…) unless Settings › Privacy › Phone
  companion › "Also allow plain home Wi-Fi" is on; Alton finds its Tailscale HTTPS address itself
  (`tailscale serve status`) and the pairing QR code uses it, so pairing is encrypted too.
- ✅ PIN authentication kept instead of biometrics.

Also in 0.81 (asked for alongside Phase 1): **easier Android updates**: the new version
downloads in the background, is checked (same app, same signing key) and is installed through
Android's PackageInstaller when you leave Alton. After the first such update, Android 12+ needs
no Install screen. Switch: phone app › Settings › This app › Update automatically.

## Phase 2: Unified intelligence (next)

- 🔶 Central intelligence engine connecting all existing capabilities. **0.92:** the first piece:
  `shared/context.ts` `describeNow()` builds one "right now" picture from everything Alton knows
  and every chat gets it (see the next item). Still to do: one place that decides which
  capability answers what (with model choice and confidence later in this phase).
- ✅ Shared contextual awareness across applications. **0.92:** chat on the PC now knows, on every
  message: the app in front, gaming, what Alton itself is busy with (Agent Mode, mod updates…), the
  next calendar event, today's shift, running timers, unread email (count and senders), what's
  playing, the weather (and rain soon) and phone messages. The phone app gets the same picture from
  the PC (in its status) for its own chats while the PC is connected.
- ⬜ Cross-device conversation continuity.
- ⬜ Intelligent memory consolidation.
- ⬜ Personal knowledge graph.
- ⬜ Predictive assistance.
- ⬜ Automatic AI model selection.
- ⬜ Confidence assessment and information verification.

## Phase 3: Self-development

- ⬜ Self-diagnosis and error analysis (partly there: Alton reads its own errors and code).
- ⬜ Source code analysis.
- ⬜ Autonomous improvement proposals.
- ⬜ Sandboxed development and testing.
- ⬜ Automated regression testing.
- ⬜ Approval-based code modifications.
- ⬜ Development roadmap management (partly there: Notes › "Alton roadmap").
- ⬜ Automatic documentation.
- ⬜ Performance benchmarking.

## Phase 4: Persistent agents

- ⬜ Multiple simultaneous background tasks.
- ⬜ Pause, resume, edit and cancel tasks.
- ⬜ Long-running projects spanning multiple days.
- ⬜ Task recovery across restarts.
- ⬜ Automatic result verification.
- ⬜ Learning from successful workflows.
- ⬜ Specialized AI agents.
- ⬜ Intelligent task prioritization.

## Phase 5: Personality refinement

- ⬜ Consistent personality across devices and AI models.
- ⬜ Context-sensitive humour and sarcasm.
- ⬜ Dynamic voice expression.
- ⬜ Natural conversational pauses.
- ⬜ Constructive disagreement.
- ⬜ Configurable initiative levels.
- ⬜ Personalized interactions based on memories and habits.

## Phase 6: Final stability and version 1.0

- ⬜ Full integration testing.
- ⬜ Desktop and mobile synchronization testing.
- ⬜ Performance optimization.
- ⬜ Security auditing.
- ⬜ Long-duration reliability testing.
- ⬜ Interface consistency.
- ⬜ Error handling and recovery testing.
- ⬜ Final bug fixes.
