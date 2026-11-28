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

## Phase 2: Unified intelligence (done, 0.92–0.99)

- ✅ Central intelligence engine connecting all existing capabilities. **0.92:** one "right now"
  picture for every message. **0.99:** `shared/brain.ts` `messageBrief()`: one place that plans
  each message: which model answers (0.96), the check-first note for changing facts (0.97), and
  what Alton knows about anyone or anything the message mentions (from the knowledge graph, 0.95),
  alongside the "right now" picture and who's who. Chat uses it through `deps.brief`.
- ✅ Shared contextual awareness across applications. **0.92:** chat on the PC now knows, on every
  message: the app in front, gaming, what Alton itself is busy with (Agent Mode, mod updates…), the
  next calendar event, today's shift, running timers, unread email (count and senders), what's
  playing, the weather (and rain soon) and phone messages. The phone app gets the same picture from
  the PC (in its status) for its own chats while the PC is connected.
- ✅ Cross-device conversation continuity. Chat history already synced both ways when the phone
  connects. **0.93:** picking up where you left off: the phone shows "Continue from your PC ·
  “title”" for the chat open on the PC in the last 30 minutes (one tap opens it, fetching it first
  if needed); the PC says "Carry on from your phone: “title”" when a conversation from the last 15
  minutes arrives from the phone (once per chat).
- ✅ Intelligent memory consolidation. **0.94:** `shared/memory-tidy.ts`: a new memory that says
  the same as an existing one (similarity ≥ 0.75) updates it; a daily tidy-up (and Notes › Memory ›
  Tidy memories) merges near-duplicates (≥ 0.5, the newest wording kept, never across projects)
  and retires memories about a moment that has passed ("tomorrow" after 3 days, a date that's over,
  "this week" after 2 weeks, "currently" after 2 months). Everything taken out is archived and
  "Undo last tidy-up" puts it back. Tuned on the owner's 43 real memories.
- ✅ Personal knowledge graph. **0.95:** `shared/knowledge.ts` + `services/knowledge.ts`: a small
  model turns the memories into people, places, projects, organisations, things and events (with
  other names and short notes) and the links between them; rebuilt only when memories change (at
  most every 3 h; background work, paused at the spending limit). Chat always gets a short "who's
  who", and a `look_up` tool gives everything known about a name (other names work: "Fives" →
  Will).
- ✅ Predictive assistance. Alton already offered suggestions (rain, important email, apps opened
  together → a routine, stalled goals, evening wrap-up, error windows). **0.98:** it now
  anticipates: an app opened at about this time (±20 min) on 4 of the last 7 days and not yet
  today gets "You usually open X around now. Want me to open it?" with a one-tap Open (not over
  full-screen apps, background helpers skipped, at most every 3 h, quiet hours respected). Together
  with the "right now" picture (0.92), chat can also answer "anything I should know?".
- ✅ Automatic AI model selection. **0.96:** `shared/model-pick.ts`: each chat message gets a
  complexity score (length, code/error logs, planning/comparing/explaining/writing words, PDFs and
  pictures; everyday requests score low). Below 3 → Haiku; 3 or more → the "strongest model it may
  use" (Sonnet by default). Settings › AI › "Choose the model for each message" (on by default);
  Saver mode still forces Haiku; research chats keep their own model; spending limits apply.
- ✅ Confidence assessment and information verification. **0.97:** `shared/confidence.ts`: a
  message about facts that change (prices/stock, latest versions/news, opening times, results,
  release dates, travel, rates, outages) gets a note to check with a web search first and say where
  the answer came from (not for things Alton has its own tools for: weather, calendar, shifts,
  email, time); a standing rule in every chat (PC and phone): say when unsure, never invent facts,
  numbers, names, links or quotes, ask when a request is ambiguous and it matters. Launching apps:
  a loose name that fits several installed apps now asks "Which one?" instead of opening the first.

## Safety gate (done, 0.99.1–1.0.0; must be done and tested before Phase 3 or Phase 4 starts)

Added by the owner on 27 Nov 2026. Phase 3 (self-development) and Phase 4 (persistent autonomous
agents) stay switched off until every item here is implemented and has tests. Phase 2 carries on
meanwhile. PIN authentication stays; no biometrics.

- ✅ Shared API spending limits across desktop and mobile (one monthly limit and per-task caps
  covering the PC and the phone app's own Claude use). **0.99.1:** the phone sends its daily Claude
  costs with each sync (`SyncToPc.usage`); the PC keeps them (`usage-phone.json`, replaced each
  time, never added twice) and counts them in the month's total, the 80%/100% warnings and the
  at-limit action (`UsageTracker.setPhoneDays`, `shared/usage.ts` `withPhoneDays`). The PC sends
  back the shared total, limit and action (`SyncFromPc.budget`); between syncs the phone adds what
  it has spent since (`sharedMonth`) and applies the same rule before each Claude request
  (`budgetBlock`: "pause everything" stops phone chat; "pause background" stops phone research).
  The PC's limit applies to both once set; the phone's spending bar shows "(PC + phone)". Per-task
  caps are for Agent Mode, which only runs on the PC. Tests: tests/shared-budget.test.ts,
  tests/main/usage.test.ts, tests/main/phoneApi.test.ts.
- ✅ Verification of intended versus actual changes during Alton's own automated operations (each
  automated job states what it means to change, and the result is compared; mismatches stop it and
  are reported). **0.99.2:** `shared/intended.ts` (`compareChanges`: unexpected / missing /
  different; `describeMismatch`; `parseGitChanges`; `idChanges`). "Update Alton from my phone"
  (the job Phase 3 builds on) won't start with uncommitted work in the project, lists the files the
  zip will add or change before copying (`plannedChanges`), and compares that with what git staged
  before committing: anything else unstages, stops and reports, with nothing committed or pushed.
  The daily memory tidy-up checks that exactly the planned memories went (else puts everything
  back) and never takes out more than a third at once; a stop goes to the action history and a
  notice. Already in place: volume and file-move checks (0.86) and the Cyberpunk mod footprint
  check (drift). Tests: tests/intended.test.ts, tests/main/projectUpdate.test.ts,
  tests/main/notes.test.ts.
- ✅ Automated post-update health checks beyond successful application startup (key features
  exercised after an update; failures count towards rollback). **0.99.3:** a minute after each
  start, `services/health-check.ts` checks (read-only): saved data parses (every backed-up file
  and chat), settings loaded, the window's key channels have handlers (`handledChannels` in
  ipc/handle.ts), the window is alive and not crashed, Windows encryption works; and as warnings:
  each saved key still unlocks, the phone link is up when switched on, no errors since starting.
  `shared/update-health.ts` `healthVerdict`. A critical failure means the start doesn't count as
  working (not even on a clean quit), is reported (notice, action history, error log) and is saved
  in boot.json; on the last allowed failing start after an update (`rollBackNow`) Alton rolls back
  straight away instead of waiting for the next start. Tests: tests/update-health.test.ts,
  tests/main/health-check.test.ts.
- ✅ Stronger prompt injection protection enforced at the tool and permission level (content from
  outside can't unlock risky tools: after untrusted content is read, risky actions need the user's
  explicit approval, whatever the model says). **0.99.4:** `shared/tool-guard.ts`. Chat: the
  provider tracks outside content (`OutsideContent`: emails, documents, clipboard, files,
  calendar, messages, logs, past chats, the screen, and Claude's own web search/fetch) for that
  turn and the next two; meanwhile every risky tool (`riskyTool`, input-aware: posting/sending,
  opening links or searches, power and shutdown timers, moving files, closing apps, routines and
  schedules, paid research, saving or deleting memories, buying, changing mods) waits for main's
  Approve / Deny card (`ctx.askApproval`); "no", no answer or no way to ask refuses it. An approved
  action is marked so the window doesn't ask twice. Agent Mode: before a click (or Enter/Space)
  the input helper reads the UI Automation element there (`labelAt`/`focused`); a button like
  Send, Pay, Buy, Place order, Delete, Submit, Install, Accept… needs the user's OK unless a
  confirm_action was approved just before (90 s / 4 actions); "no" stops that step. Limits: Agent
  Mode typing a line break into a message box isn't a button press and still relies on
  confirm_action. Tests: tests/tool-guard.test.ts, tests/main/anthropic.test.ts,
  tests/main/agent.test.ts.
- ✅ Optional encrypted backups to a separate storage location (another drive or folder, encrypted
  with a key only on this PC, restorable). **0.99.5:** `services/offsite-backup.ts` +
  `ipc/offsite.ts`, Settings › Privacy › "Encrypted backups elsewhere". Daily (and Back up now):
  the BACKUP_ITEMS files (never *.bin keys) bundled with per-file SHA-256, gzipped, AES-256-GCM
  into `<folder>/Alton backups/alton-YYYY-MM-DD.altonbak`; each copy is read back, decrypted and
  hash-checked before it replaces the old one; 8 kept. The random key is stored encrypted by
  Windows (offsite-key.bin, safeStorage). A recovery code, shown once, wraps the key (scrypt) in
  `alton-backup-key.json` beside the backups, so a new PC can restore with it. Restore checks
  everything before changing anything, backs up current data first, then restarts. Folders inside
  Alton's data are refused; the same drive gets a warning. Tests: tests/main/offsite.test.ts.
- ✅ Safe task resumption that prevents duplicate irreversible actions (resumed tasks know which
  irreversible steps already happened and never repeat them). **1.0.0:** Agent Mode keeps a
  write-ahead record of irreversible steps (`IrreversibleStep` in shared/agent.ts: each approved
  confirm_action and each press of a Send / Pay / Delete… button is saved to agent-task.json as
  "started" before it happens and "done" after). On resume (`opts.prior`): a confirm_action
  matching a done step (`priorStep`, wording ≥ 0.6 alike) is refused without asking; one that was
  only "started" asks with a "may already have happened" warning; a button pressed before always
  needs a fresh OK with a warning (never covered by an earlier approval); the resume prompt lists
  them. Already safe: routines record their run before starting (no repeat at start-up); a
  scheduled Agent Mode timer is cleared before the task starts, and one overdue by 30+ min isn't
  run. Tests: tests/agent-resume.test.ts, tests/main/agent.test.ts.
- ✅ PIN authentication retained; biometrics excluded.

## Phase 3: Self-development (started 28 Nov 2026 with the owner's go-ahead)

- ✅ Self-diagnosis and error analysis (partly there: Alton reads its own errors and code).
  **1.1.0:** `shared/self-diagnosis.ts` + the `diagnose_alton` tool: reads the whole error log
  (`ErrorLog.history()`, current + previous file, stack traces kept with their entry), groups
  repeats into distinct problems (`signature` strips blob ids, uuids, build hashes, numbers,
  paths), counts them with first/last seen and the first stack frame, explains known causes
  (security policy, network, Claude key/limits, locked files, full drive, memory, deprecations,
  uncaught crashes), ranks by severity, and marks problems not seen since this version first
  started (`BootRecord.since`) as probably fixed; adds the start-up health check. Read-only.
  On this PC's real log it found 213 entries → one live minor issue (ScriptProcessorNode
  deprecated, the voice audio) and the old image-policy error correctly marked fixed.
- ✅ Source code analysis. **1.2.0:** `shared/code-map.ts` + the `analyze_arc_code` tool
  (`SourceReader.codeMap()`, cached a minute): every code file in src, tests, phone/src and
  scripts with its imports (aliases, relative paths and index files resolved), exports and
  TODO/FIXME lines; what imports each file, everything a change would reach (`dependents`), the
  tests that cover it (`testsFor`), where a name is defined and used (`findSymbol`), and an
  overview (areas, biggest files, untested code, TODOs). On this project: 359 files, 73,642 lines,
  136 test files, mapped in about 0.25 s.
- ✅ Autonomous improvement proposals. **1.4.0:** `shared/proposals.ts` + `services/proposals.ts`
  (userData/proposals.json) + the `improvement_ideas` tool. Weekly (and on "refresh"), Alton
  turns its own diagnosis and code map into ideas: fixes for recurring or serious log problems
  (one-off blips skipped), tests for untested code over 300 lines, real `// TODO:` notes, and
  splitting files over 2,000 lines; each with why, files, effort and priority. Stable ids, so
  an idea (even a dismissed one) is never suggested twice; accept / dismiss / done. A notice
  when there are new ideas. Suggestions only: nothing is changed. First ideas on this PC: move
  the voice audio off the deprecated ScriptProcessorNode (158 warnings), tests for the Cyberpunk
  mod tool, toolbox and Vortex sync, and splitting the 8,381-line phone app.
- ✅ Sandboxed development and testing. **1.5.0:** `services/dev-sandbox.ts` +
  `shared/sandbox-rules.ts` + the `dev_sandbox` tool (the owner's choice: a separate copy, with
  approval). "start" makes a local `git clone` of the project's last commit in
  userData/dev-sandbox (node_modules linked by a junction, removed as a link before the copy is
  deleted); read / edit (exact find-and-replace, once) / write / delete only inside the copy, and
  only source, tests and .md notes (`blockedPath`: never package files, lockfiles, .npmrc,
  .github, scripts, android, build or test config, .git, node_modules, secrets); "check" runs
  the project's own typecheck, lint and tests there (fixed commands; asks the user once per copy;
  stops at the first failure with the useful lines); "diff"; "discard". Counts as risky after
  outside content (gate 4). Tried for real on this PC: copy, edit, diff, all three checks passed
  in 53 s, copy deleted, real node_modules intact.
- ⬜ Automated regression testing.
- ⬜ Approval-based code modifications.
- ⬜ Development roadmap management (partly there: Notes › "Alton roadmap").
- ⬜ Automatic documentation.
- ⬜ Performance benchmarking.

## Phase 4: Persistent agents (after Phase 3; same go-ahead)

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

## Requests along the way

- ✅ PC lights (asked 28 Nov 2026). **1.3.0:** the `pc_lights` tool through OpenRGB's SDK server
  (`services/openrgb.ts`, a small client for its protocol on 127.0.0.1:6742 only; `shared/lights.ts`):
  on (back to each device's effect from before Alton changed it), off (the device's own Off mode,
  else black), any colour (names, #hex, rgb()), brightness, effects (rainbow, breathing,
  flashing, static, wave → the device's own modes), one device by everyday name or all, saved
  OpenRGB profiles. Warns when Armoury Crate / iCUE / SignalRGB are also running (they can take
  lights back). On this PC OpenRGB currently sees the ASUS TUF B850 motherboard; the RAM, SSD,
  mouse and other lights are under Armoury Crate and Synapse. Tests: tests/lights.test.ts,
  tests/main/openrgb.test.ts (a fake OpenRGB server).
