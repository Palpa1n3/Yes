# Alton (ARC) — quick handover

A short, stand-alone handover (current to **0.73.0, 24 Nov 2026**). The full history and per-feature
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

- **Vortex sync not yet confirmed on the real Vortex** (it was open during all testing). After the owner
  closes Vortex: check `%APPDATA%\ARC\vortex-sync.json` `lastRun`, then in Vortex that the saved mods and
  older copies show as disabled and the conflict warnings are gone after Deploy. If `--set` values don't
  stick, look at how this Vortex version (DuckDB + level_pivot over LevelDB) stores keys.
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
