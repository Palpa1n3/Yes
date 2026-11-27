# Alton (ARC) — quick handover

A short, stand-alone handover (current to **0.85.0, 27 Nov 2026**). The full history and per-feature
detail is in `HANDOVER.md`; read this first if you need to pick the work up fast.

## What it is

- **PC app** (Windows, the main thing): Electron + React 18 + TypeScript + Tailwind + Zustand. A voice/chat
  assistant called **Alton** (code, installer and data folder still say **ARC**). Claude via
  `@anthropic-ai/sdk`; local Whisper for speech; offline mock replies.
- **Phone app**: `phone/` (Vite) → built into `docs/` (GitHub Pages) and wrapped by **Capacitor** for Android
  (`android/`, Java plugins under `android/app/src/main/java/com/alton/phone/`). Talks to Claude directly
  (key kept on the phone) and to the PC over Tailscale.
- **Repo**: GitHub `Palpa1n3/Yes`, branch `main`. Pushing a `package.json` version bump to `main` makes
  GitHub Actions build the Windows installer (auto-update) and the Android APK.

## Picking up work

1. `npm install`, then read `HANDOVER.md` (long) and this file.
2. Every change: `npm run typecheck` · `npm run lint` · `npx vitest run` · `npx electron-vite build` ·
   `npm run build:phone` (writes `docs/`; then restore deleted old bundles with
   `git ls-files -d docs/assets | xargs -r git checkout --`) · `npx prettier --write <changed files>`.
3. Bump `package.json` version, `npm install --package-lock-only --ignore-scripts`, commit (end the message
   with the Co-Authored-By line), push to `main`. **The owner wants it pushed without asking once all checks
   pass.** Never push failing work.
4. Android Java only compiles on GitHub Actions (no local javac). After a push, check the "Build and
   release" run (jobs `release` and `android`) via the GitHub API.

## Where things are

- `src/shared/` pure logic + types (all tested in `tests/`). `src/shared/ipc.ts` is the typed IPC contract
  (`IPC`, InvokeMap/SendMap/EventMap, `ArcAPI`); preload exposes `window.arc`. New IPC group ⇒ add it to
  `tests/ipc.test.ts` and a mock in `tests/arcMock.ts`.
- `src/main/services/` services; `src/main/ipc/` wiring (`toolbox.ts` holds many handlers and Claude tools;
  tool definitions in `services/extra-tool-defs.ts`).
- `src/renderer/` UI. Sections (tabs) are registered in `components/tabs/registry.ts` + `stores/uiStore.ts`
  (`TAB_IDS`) + `App.tsx` (`VIEWS`) + `shared/arcCommands.ts` + `renderer/voice/arcActions.ts`.
  Since 0.71 there is **no tab row**: the top bar shows the current section (`SectionButton`) and
  **Settings › Sections** (`settings/SectionsTab.tsx`) lists them all; Ctrl+1–9 still jump.
- Settings pages: `components/settings/` (`SettingsPanel.tsx` `PAGES`, `SETTINGS_TABS` in uiStore).
- The PC's own data: `%APPDATA%\ARC\` (settings.json, encrypted keys `*.bin`, chats, logs\arc.log, and the
  mod tools' files listed below).

## Roadmap

`ROADMAP.md` holds the agreed plan to 1.0 (six phases; Phase 1 "Safety foundations" is under way)
with each item's status. Update it with every release that moves an item.

## Recent work (newest first)

- **0.85** Agent task state: `SavedAgentTask` + `resumeTask()` in shared/agent.ts; ipc/agent.ts saves
  userData/agent-task.json once per step while running/paused, clears it on done/error/stopped; IPC
  `agent.interrupted/resume/dismissInterrupted`; AgentPanel shows a Carry on / Dismiss card when idle
  and a saved task exists. Next roadmap item: verification of system changes before and after.
- **0.84** Crash/shutdown recovery: `services/session-guard.ts` (`sessionGuard()` singleton,
  userData/session.json: `clean`, `lastAlive` heartbeat every 30 s, `work.agent`/`work.research`);
  `shared/session.ts` `lastSessionReport(prev, bootedAt)` (PC went down if Windows booted after the
  last heartbeat) + `describeRecovery`. index.ts: report read before stores load, notice after the
  window first loads, `markClean()` on before-quit and window `session-end`; renderer
  `render-process-gone` / `unresponsive` (20 s) → reload, max 3 per 5 min. Agent onStatus and
  background research record their work. **WHATS-NEW.md**: the owner's one-page summary, newest
  first; refresh it and send it after every item (they asked 27 Nov).
- **0.83** Spending limits: settings `budgetAction` ('warn' | 'pause-background' | 'pause-all', default
  pause-background) and `agentTaskLimit` (USD, default 1.3 ≈ £1). `budgetBlock()` in shared/usage.ts
  (`BACKGROUND_FEATURES`), `UsageTracker.blocked(feature)`; checked before Agent Mode starts
  (ipc/agent.ts, which also adds up `taskSpend` per task and calls `runner.stop()` at the cap), before
  background research (toolbox `start_background_research`), before memory learning
  (`chats.onSaved`) and for chat (assistant.ts: offline model or mock with a notice). Settings › AI ›
  Spending has both controls. Next roadmap item: crash and unexpected shutdown recovery.
- **0.82** Update rollback (`shared/rollback.ts`, `services/rollback.ts`): `BootGuard` (userData/boot.json)
  is started at the top of `main/index.ts` (packaged only); `markOk()` a minute after did-finish-load
  and on before-quit; `onBoot` returns a version to go back to after `FAILS_BEFORE_ROLLBACK` (2) failed
  starts of an upgraded version. `rollBack()` fetches `releases/download/v<prev>/latest.yml`, downloads
  and SHA-512-checks the installer to `%TEMP%\ARC-rollback`, restores the `*-before-update-<current>`
  backup, runs `ARC-Setup-<prev>.exe /S --force-run`, quits. Skipped versions: `autoUpdater.autoDownload`
  is now false and `update-available` only downloads versions not in `boot.json` `skip`. IPC
  `updates.rollback`; Settings › Updates "Go back"; backups list shows damaged files. Owner asked (27 Nov)
  to start each roadmap item automatically: see ROADMAP.md, next is "API usage and spending limits".
- **0.81** Phase 1 started. Backups (`services/data-backup.ts`): all of Alton's data files
  (`BACKUP_ITEMS`), a `manifest.json` per backup (which files were readable), 7 daily + 4 weekly
  (`keepPlan`), a `before-update-<version>` copy when an update has downloaded (`ipc/updates.ts`),
  `recoverDamaged()` at the very top of `main/index.ts` (before any store reads its file) puts back an
  unreadable JSON file from the newest good backup and keeps the damaged one as
  `<file>.damaged-<time>`. Restore skips copies recorded as damaged. Paired phones and `*.bin` are
  never copied. Android self-update (`SelfUpdate.java`, `UpdateReceiver.java`): background download
  with progress events, APK checked (package name + signing certificates equal the installed app's),
  installed through a PackageInstaller session (`USER_ACTION_NOT_REQUIRED` on Android 12+; needs
  `UPDATE_PACKAGES_WITHOUT_USER_ACTION`, and Alton must be the installer of record, which it becomes
  after its first self-install, so the first one still shows the Install screen). Phone app: auto
  download when a release with Alton.apk is found, install on `visibilitychange` hidden when silent is
  possible, "Updated to X" toast, switch in Settings › This app (`alton-auto-update`).

- **0.80** Saved mods stay saved. Found 24–27 Nov: (a) the sync used to move saved mods' files back
  into the game "so Vortex removes them on deploy", but Vortex had forgotten them, so they were simply
  active again (1,185 files of 44 mods); (b) the owner's Vortex **collection "Welcome to Night City 2.5"**
  (`collection_iszwwe_484_…`) re-enables its required mods every time Vortex starts ("start installing
  dependencies … determined unfulfilled dependencies 41"), so saved mods kept coming back. Now: the sync
  never moves saved files into the game; it switches off any saved mod Vortex has on (drift), switches off
  enabled collection entries when that happens (they're only lists), and `clearSavedFromGame` takes saved
  files out of the game when the game file IS the saved mod's staging file (same dev:ino; if the saved
  folder already has that file the extra link is dropped). `lastProfileSwitch` also reads Vortex's startup
  line "Triggering profile change health checks {profileId}". Done by hand on 27 Nov: collection entry and
  43 saved mods off, redeployed; 0 saved files left in the game.
  Crashes left: 22:15 and 22:57 on 24 Nov were `Cyberpunk2077.exe+0x2FA84E6` while driving (no mod on the
  stack), with the saved mods still active. Car mods (Authentic Shift ×5, Shift) are still off for testing.
- **0.79** Deploy guard: Vortex can come back from a restart on another game and a **new empty
  "Default" Cyberpunk profile** (log: "the active game is no longer known, resetting"); deploying that
  takes every mod out of the game (happened 24 Nov 18:47, fixed by hand: `settings.profiles.activeProfileId`,
  `lastActiveProfile.cyberpunk2077`, `nextProfileId` = "wpFTd0uli" via `--set`, then redeploy).
  `vortex-sync.json` now keeps `profileId` (from each sync); `deployWhenOpen` reads the last
  "switched to profile" line in `%APPDATA%\Vortex\vortex.log` (`lastProfileSwitch`) and only presses
  Deploy on that profile; after Alton reopens Vortex (`afterReopen`) a wrong profile is pointed back once.
  ARP turned out not to be the cause (crashes continued without it, now ~30 s after loading, in a car).
  The minidump (`%LOCALAPPDATA%\REDEngine\ReportQueue\…\Cyberpunk2077.dmp`) shows CET → Codeware → game.
  Test in progress: Authentic Shift (6823) + GUI + Sound Mixer + Realistic Vehicle Physics (beta) + Test
  Platform + Shift (22340) switched off (two transmission mods at once). Vortex's own "install missing
  requirements" re-installed the Test Platform at 18:11.
- **0.78** Crash blame by timing (`repeatedLead` in shared/cpcrash.ts, `crashLead` in the service): when
  ≥3 recent crashes hit the same game address with only frameworks on the stack, Alton reads the RED4ext
  plugin logs (`red4ext\logs\<plugin>-<date>.log`) and blames a plugin that logged the same (normalised)
  line within 8 s before nearly every crash → `ignore-plugin` with a `reason` (undoable). Frameworks never
  blamed this way, except ARP. On 24 Nov: 8 crashes at `Cyberpunk2077.exe+0x278938` (Codeware+0xB3E25 on
  the stack) since 00:30, each 2–3 s after ARP's "[FaceGraph] unregistered build … pma_paperdoll_sermo"
  (the inventory/photo-mode V model going away). ACM isn't installed (ARP in AMM-only mode). ARP added to
  RED4ext's ignore list by hand (`red4ext\config.ini` `ignored = ["RadioExt", "AppearanceRuntimePlugin"]`).
  NB: with ARP off there are no ARP crash reports; Alton falls back to CrashInfo.json.
- **0.77** Crash position: `parseCrashInfo` reads `location` X/Y/Z from CrashInfo.json; `placesNear` finds
  coordinates in a mod's Lua/redscript (`{ x =, y =, z = }`, `Vector4.new(...)`) within 5 m; after a crash
  while playing, auto-fix saves away the deployed mod that sends V there (`placeSuspects`, `save-mod`).
  On 24 Nov: **Authentic Shift Test Platform** (38671, on by default) teleported V onto a test track in the
  sky at (600, −5325, 901) on every save load and built 38 pieces + vehicles → "no buildings" and a crash
  (Codeware DynamicEntitySystem). Switched off in Vortex by hand; of 3,498 mod scripts only it matched.
- **0.76** (a) Deploying really works now: Vortex 2 has no "Deploy Mods" button; it's the menu item
  **"Manual apply (Deploy)"** in the Mods page's **"More actions"** menu (opened with a real mouse click,
  no Invoke pattern; the cursor is put back). `deployWhenOpen` opens Mods, the menu, then the item; it
  also retries every 5 min while `needsDeploy`. Earlier "deploys" only happened by luck. (b) The
  automatic dependency run no longer puts back saved mods (only the button does). On 24 Nov it had put
  back **Fake Lights No More** (0.5, June; hooks every streaming sector through Codeware) → crash on
  loading a save with no buildings. (c) Crash guard: mods Alton put back (`fixState.switchedOn`, a day)
  that hook world streaming (`hooksWorldStreaming`) or predate the game's newest base archive are
  saved away again after a crash while playing (`save-mod` fix, undoable).
- **0.75.2** Changes for Vortex no longer wait for the owner to close it: `VortexSync.applyNow()` closes
  Vortex politely (`taskkill /IM Vortex.exe`, no /F; it exits in ~1 s), syncs, reopens it and presses
  Deploy. Used for mods to switch back on (auto-fix, Put back), the Sync button, and every 10 min while
  some wait (never while Alton's updates are installing). `olderDuplicates` no longer switches off a
  main file because of its own hotfix (it had switched off RPO 3.0 BETA; switched back on by hand on
  24 Nov with `--set`).
- **0.75.1** `providesName` only counts real code (`.reds` in r6\scripts\<name>, `.dll` in
  red4ext\plugins\<name>): Immersive V Dialogue Expanded ships sounds into AudioXL's folder, so AudioXL looked
  "on" and wasn't switched back on. 0.75 fixed Ragdoll Physics Overhaul on the owner's PC (main file + hotfix).
- **0.75** Script compile failures fixed by themselves from RedRequire's report: mods that define what's
  missing are switched back on (or put back from Alton's saved list); a mod whose main file is missing is
  downloaded again. Updates now install the primary main file (+ newer hotfixes), not just a hotfix.
- **0.74** Missing Cyberpunk dependencies (Nexus "Requirements", read from Nexus' public GraphQL, no key)
  install by themselves (Premium + auto-fix, every 6 h) or from Mods › Dependencies; Vortex's "Potential
  Duplicate Mods" entries (old copies that are off) are taken out during the sync, folders kept in
  `%APPDATA%\Vortex\cyberpunk2077\_alton_old_copies\`.
- **0.73** Vortex changes were being saved but never deployed: Alton now flags a deploy and presses
  Vortex's "Deploy Mods" button the next time Vortex opens.
- **0.72** Vortex conflicts: older copies of the same Nexus mod that deploy the same files as a newer copy
  are switched off; every `--set` is read back with `--get` and only kept values count; sync runs each time
  Vortex is closed.
- **0.71** Navigation moved into Settings › Sections; layouts stack on narrow windows; compact view has
  "All sections".
- **0.70** Vortex sync (`services/vortex-sync.ts`, `shared/vortex.ts`): via Vortex's own
  `Vortex.exe --get/--set` (only while Vortex and the game are closed, after backing up
  `%APPDATA%\Vortex\state.v2`): saved mods switched off in Vortex, conflict "after" rules, Vortex
  automation on; a UI-Automation PowerShell loop presses **Continue** on Vortex's "already installed"
  (Replace) dialog while updates run.
- **0.69** Fixed the outdated-mod check that wrongly removed 115 Cyberpunk mods (see "Gotchas"); crash
  detection from `CrashInfo.json`; Premium updates download from Nexus (`download_link.json`) and call
  `Vortex.exe --install-archive`; **Minecraft tab** (Lunar Client/.minecraft, Fabric, Modrinth).
- **0.60–0.68** Cyberpunk **Mods tab**: Vortex mod list, Nexus update checks (user's own API key,
  encrypted), launch check (RED4ext logs), auto-fix (RED4ext ignore list, REDmod redeploy, load order),
  crash reports, outdated mods (remove/put back), recommendations, load order (`archive\pc\mod\modlist.txt`).
- **0.56–0.59** phone messages on the PC, money tools on the phone (payslip, selling, spending, price
  watch), moving backgrounds + UI options, Windows wallpapers, widget monitor choice, mouse-stutter fix
  (no `setIgnoreMouseEvents(…, {forward:true})`; cursor polled instead).

## Game-mod tools (map)

- **Cyberpunk** (`services/cyberpunk-mods.ts`, big): finds the GOG/Steam game and Vortex's staging folder
  (`%APPDATA%\Vortex\cyberpunk2077\mods`, same layout as the game folder). Pure helpers:
  `shared/cpmods.ts` (folder names, versions, update jobs), `cplaunch.ts` (launch logs, REDmod log),
  `cpcrash.ts` (crash reports + CrashInfo.json), `cpfix.ts` (auto-fixes, RED4ext `config.ini` ignore
  list), `cpoutdated.ts` (evidence-based outdated list, `MAX_REMOVE`=12, frameworks never),
  `loadorder.ts` (archive index reading, clashes), `cprecommend.ts`. UI: `tabs/ModsTab.tsx`.
  Alton's files: `cpmods-cache.json`, `cpfix.json`, `cpremoved.json`, `cprec.json`, `vortex-sync.json`,
  `vortex-backups\`. Saved (removed) mods' files: `<game>\_alton_removed_mods\` with
  `Removed mods (Alton).txt`.
- **Minecraft** (`services/minecraft-mods.ts`, `services/zip.ts`, `shared/mcmods.ts`, `tabs/MinecraftTab.tsx`):
  Lunar profiles under `~\.lunarclient\profiles`, Modrinth (no key, sha1 lookups), changes logged with Undo
  in `mcfix.json`; refuses while `javaw.exe` runs.

## Open / to verify on the owner's PC

- **Vortex sync confirmed working** (24 Nov, read back with `Vortex.exe --get`): old copies disabled,
  conflict rules saved, automation on. Still to confirm: the automatic "Deploy Mods" press when Vortex
  opens (`%APPDATA%\ARC\vortex-sync.json` `needsDeploy` should turn false). 179 mods had an old and a new
  copy installed side by side (updates installed as new mods rather than replacing).
- 0.74 on the owner's PC: the next sync (Vortex closed) should take out 22 duplicate entries; 3 dependencies
  should install (ME Armor System, Romanced Enhanced Showers Feature, Virtual Atelier Delivery).
- 0.75: after the next failed launch (or "Fix it for me"): AudioXL switched back on, Ragdoll Physics
  Overhaul 3.0 main file + hotfix downloaded.
- Cyberpunk state on 24 Nov: game 2.50; RadioExt switched off via RED4ext ignore list (2.92 downloaded,
  not deployed; Alton re-enables a plugin automatically when its DLL changes); NCPD Prevention's REDmod
  scripts break REDmod's compile; 102 mods saved/removed (13 frameworks were put back); TweakXL rejects
  records from Ranger Combat Boomerang, All Foods Cache, Cyber Enemies, Enemies Melee Attacks Fixes.
- Minecraft: "The Vanilla Experience" has Just Mob Heads and Searchables twice; Searchables made for 1.21.9.
- Earlier real-device checks still pending are listed in `HANDOVER.md` › Open items.

## Gotchas learned the hard way

- **RED4ext keeps only 5 launch logs** (`max_files = 5`): never infer the game-update date from "the oldest
  log"; Alton remembers it (`knownPatch`) once an older version's log is seen.
- **Script errors cascade**: if Codeware is missing, nearly every redscript mod errors. Don't treat that as
  evidence against those mods.
- **Vortex**: bare `nxm://` links handed to Vortex never started downloading here; it has no persistent
  "always replace" setting; `--get/--set` do nothing while Vortex is open (even with `--user-data`); keys
  are split on unescaped dots, values are JSON text, arrays are stored as one value.
- Shell heredocs mangle backslashes in regexes and Java strings: write scripts with the Write tool, or use
  Edit, and check the result.
- `docs/assets` old bundles must be restored after `npm run build:phone` (the phone app's update check
  needs them).

## Working with the owner

- Windows 11, Samsung Android phone, UK (South Wales). Plain words, short summaries with a **"what to
  test"** list; PowerShell commands one per code block. Cost-conscious.
- Wants fixes to happen by themselves (auto-fix on by default) but everything undoable.

## Safety rules that must stay

- Secrets (Claude, Nexus, Gmail app password, calendar link, Discord webhook, SmartThings) are stored
  encrypted in main only; never sent to the renderer, the phone or the repo.
- Agent Mode never types passwords or card numbers; asks before paying, sending, deleting or changing
  settings. Phone actions are buttons the user taps.
- Mod tools never delete mod files: removed mods are moved and kept; Vortex changes are backed up first and
  only made while Vortex is closed; downloads only from Nexus/Modrinth CDNs and are hash-checked where the
  site gives a hash.
- The phone companion serves private/Tailscale addresses only. Original designs only.
