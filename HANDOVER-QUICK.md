# Alton (ARC) — quick handover

A short, stand-alone handover (current to **0.75.2, 24 Nov 2026**). The full history and per-feature
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

## Recent work (newest first)

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
