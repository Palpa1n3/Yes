# Handover: where Alton (ARC) stands

Read this first in a new chat, then README.md for the feature list.

## What it is

- **PC app**: Electron + React 18 + TypeScript + Tailwind + Zustand. A holographic HUD assistant
  for Windows ("Alton"; the code and installer still say ARC). Claude via `@anthropic-ai/sdk`
  (beta messages, computer use for Agent Mode), local Whisper for speech, offline mock replies.
- **Phone companion**: a web page served by the PC app on port 47615
  (`src/main/services/remote-app.html`), paired with a 6-digit code. Reachable away from home over Tailscale
  (`tailscale serve` gives an HTTPS name; `/api/ping` answers the phone app with CORS).
- **Phone-only app**: `phone/` (Vite) built into `docs/` and served by GitHub Pages. Talks to
  Claude directly with a key stored only on the phone. Connects to the PC directly over Tailscale
  (`phone/src/pc.ts`; the PC allows CORS for exactly the phone app's origin on `/api/*`), pairs with
  the 6-digit code, syncs live (`/api/import` then `/api/sync`), has a native PC tab, and sends
  chats to the PC's Alton when connected. Shows "Update ready" from `docs/version.json`. See
  PHONE_REDO.md for what's left.

- **Android app**: Capacitor 7 (`capacitor.config.ts`, `android/`) wraps the built phone app
  (`docs/`). Native bits go through `phone/src/native.ts` (speech recognition shim, text to
  speech, local notifications for reminders, share/files) with browser fallbacks; `intent:`
  links (alarm/timer/calendar) open via `IntentLinksPlugin.java`. "Phone powers"
  (`AltonNativePlugin.java`, `MessageListener.java`, `ScreenReader.java`): read message
  notifications and reply through them (only on a tapped button), read/add calendar events,
  look up contacts, set tomorrow's shift alarm silently (AlarmClock SKIP_UI), and read the chosen
  shift app's screen (accessibility, only when asked), native contact picker, media keys, SMS
  (only after a spoken "send it" or a tap), keep-screen-on, and opening as the phone's assistant
  app (ACTION_ASSIST → Driving mode). Snapchat: `snapSend` drives Snapchat through the accessibility service (Chat tab → friend by the
  name shown → type → Send), only after confirmation; People › Snapchat friends reads the chat list
  (`snapNames` filters it) so nicknames map to people. Routes: the phone's `directions` tool
  geocodes with Nominatim and routes with OSRM (like the PC), draws the route in the chat and offers
  Google Maps navigation (`google.navigation:`), started by itself in Driving mode.
  Voice: the PC's Fish Audio voice reaches the phone via `POST /api/tts` (key stays on the PC),
  or with a Fish key saved on the phone (native HTTP); `setAudioVoice` in native.ts plays MP3
  chunks and falls back to the phone's TTS. `Announcer.java` reads new messages out (from the
  notification listener, so even with the app closed): off / headphones-only / always, quiet hours.
  Widgets (same 4×2 size so they stack on Samsung): `AltonClockWidget` (date, TextClock, phone +
  Bluetooth device battery rings via `WidgetKit.batteryRow`), `AltonWeatherWidget` (forecast fetched
  natively every 30 min from the saved location, plus a screen-time strip from UsageEvents),
  `AltonScreenWidget`, and `AltonWidget` (avatar, greeting, shift, reminder, Talk/Drive).
  Lock screen: `AltonWallpaper.java` (live wallpaper: the user's picture from `setWallpaperImage`,
  a small spinning data cloud/sphere and a clock; position/size from `setWallpaper`; only animates
  while visible). Samsung's own lock clock can't be hidden by apps.
  Phone health: `Diagnostics.java` readings → `src/shared/diagnostics.ts` (`healthReport`: issues
  with fixes) → the `phone_diagnostics` tool and Settings › Phone health.
  Remote control: PC setting `phoneControl` (off by default; notice on the PC when used),
  `/api/live` frames + `/api/input` (`src/shared/remote-input.ts`), phone overlay in the PC tab.
  Faster remote view: a hidden capture window (partition `arc-remote-capture`, getDisplayMedia)
  streams the chosen monitor; frames go to main over IPC and `/api/live?screen=` returns the newest
  (falls back to thumbnails if the stream can't start). `/api/screens` lists monitors.
  Project updates from the phone: `services/project-update.ts` (unpack zip → robocopy into
  `projectDir` → git add/commit/push; fixed steps, execFile, no shell) via `/api/project/update`.
  Alarms: `setAlarmEverywhere` (phone Clock silently + Alexa). Alexa via `alexaType` (accessibility:
  opens the Alexa app, taps its keyboard button, types "… on <Echo name>", sends) or out loud
  (`tellAlexa`), chosen in Phone powers; falls back to out loud if the app route fails.
  Home-screen widget: `AltonWidget.java` + `res/layout/alton_widget.xml`; the app fills it via
  `setWidget` (next shift, weather, next reminder); its Talk/Drive buttons open the app with an
  action that `MainActivity.modeFor` turns into "talk" or "drive". Watch heads-ups: pure planner in
  `src/shared/headsups.ts`, scheduled as local notifications. Weather on the phone background:
  `refreshWeather`/`applyAmbient` (rain, snow, storm flashes, fog, frost).
  Driving mode (phone/src/main.ts) listens for the wake word
  while on screen; a true background wake word is not built (Android limits it). Claude gets them as `APP_TOOLS`. The app's origin is
  `https://localhost`, which the PC's CORS also allows. The release workflow's `android` job
  builds a signed `Alton.apk` (secrets `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD`)
  and adds it to the release; the app's "Update ready" downloads it. Android tools can't be
  downloaded in the sandbox, so the APK is only ever compiled on GitHub.

## Layout

- `src/shared/` pure logic and types (settings sanitizer, shifts, prompts, usage, phone sync...).
- `src/main/services/` main-process services; `src/main/ipc/` wiring. Typed IPC in
  `src/shared/ipc.ts` (InvokeMap / SendMap / EventMap / ArcAPI); preload exposes `window.arc`.
- Claude tools: core ones in `anthropic-provider.ts`; extra ones defined in
  `extra-tool-defs.ts` and implemented mostly in `src/main/ipc/power.ts` (power, Steam download
  mode, scheduled agent tasks, phone messages, shopping, journeys, Minecraft builds) and
  `toolbox.ts`.
- Agent Mode: `agent-runner.ts` (safety rules in its system prompt; per-task `AgentOptions`
  for shopping), `ipc/agent.ts` (queue, overlay, Esc to stop).
- Renderer: `src/renderer/` (HUD, settings pages, avatars in `components/core/`: React ones plus
  framework-free `engines.ts` shared with the phone; moods/motion in `avatarKit.ts`). Every avatar's drawing loop is framework-free (`rings.ts`,
  `face.ts`, `codeRing.ts`, `sphere.ts`, `engines.ts`); the React components are thin wrappers,
  and the phone app draws the same ones. The same
  bundle renders the desktop widget (`#widget`). Holographic notifications: `src/main/holo.ts`
  (`notifyUser`). Ambient look: `shared/ambient.ts` + `hud/Ambient.tsx`.

## How to check work (all must pass before handing over)

- `npm run typecheck` (node, web and phone projects), `npm run lint`, `npx vitest run`.
- `npx electron-vite build` and `npm run build:phone` (the phone build writes `docs/`).
- Adding an IPC group means updating `tests/ipc.test.ts`; every API group needs a mock in
  `tests/arcMock.ts`. Tests under `tests/main` use the node tsconfig, others the web one.
- Run `npx prettier --write` on changed files; check edits really applied.
- Releases: bump `package.json` version on `main`; GitHub Actions builds the installer, tags
  packages with `--publish never`, then uploads `ARC-Setup-X.Y.Z.exe`, its `.blockmap` and
  `latest.yml` with `gh release` and fails if any is missing (installed apps auto-update from it).

## Working with the owner

- Windows 11 PC, Samsung Android phone, UK (Welsh accent), uses the Samsung browser.
- They push to GitHub themselves; give PowerShell commands one per code block.
- Short summaries with a "what to test" list after each piece of work.
- Cost-conscious: keep tool output small, avoid unnecessary screenshots.

## Safety rules that must stay

- Secrets (Claude key, Gmail app password, calendar link, Discord webhook) are stored encrypted
  in main only; never sent to the renderer, the phone or the repo.
- Agent Mode never types passwords or card numbers; asks before paying, sending, deleting or
  changing settings. Shopping: offers and payments always ask (payment twice); seller questions
  follow the "Message sellers" permission. Phone actions are buttons the user taps.
- The phone companion serves private/Tailscale addresses only.
- Original designs only (avatars are inspired by, not copies of, film effects).

## Open items

- Waiting on the owner's real-device tests: Best (accents) speech model download
  (`Xenova/whisper-medium.en`, couldn't be verified from the sandbox), shifts → calendar →
  Tomorrow card alarm/Alexa buttons, phone→PC list sync, Agent Mode + Esc, the phone app's
  automatic switching (Samsung browser was blocking the background check; 0.18.2 added a
  fallback and a "Check now" message).
- Roadmap list lives in the PC app (Notes › "Alton roadmap"); pick next features from what
  testing shows is missing. Not planned: speaker recognition, native phone app, live traffic.
