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
  Widgets, each separate and size-responsive via `WidgetKit.sized` (Android 12+: a
  `Map<SizeF, RemoteViews>` so the launcher swaps looks as you resize; older: picks the biggest
  look that fits `OPTION_APPWIDGET_MIN_WIDTH`/`MAX_HEIGHT`, re-rendered in
  `onAppWidgetOptionsChanged`): `AltonClockWidget` (`widget_clock_s/_m/widget_clock`: time /
  date+time / date+time with seconds; tap → alarms), `AltonBatteryWidget` (phone + Bluetooth
  battery rings via `WidgetKit.batteryRow(ctx, d, cells)`, 2/3/4 rings by width; tap → battery
  settings), `AltonWeatherWidget` (`widget_weather_s/_w/_m/widget_weather`; forecast fetched natively
  every 30 min from the saved location; tap → Samsung/Google Weather), `AltonScreenWidget`
  (`widget_screen_s`/`widget_screen`: total / plus top apps and donut, from UsageEvents; tap →
  Digital Wellbeing), and `AltonWidget` (avatar, greeting, shift, reminder, Talk/Drive).
  A view a smaller look lacks is skipped by RemoteViews, so one fill routine serves all looks.
  Lock screen: `AltonWallpaper.java` (live wallpaper: the user's picture from `setWallpaperImage`,
  a small spinning data cloud/sphere and a clock; position/size from `setWallpaper`; only animates
  while visible). Samsung's own lock clock can't be hidden by apps.
  Shifts tab (People › Shifts): next-shift card, "Get my shifts" (shift app via chat, screenshot,
  phone calendar by keywords `S.shiftWords` via `shiftsFromCalendar`, typed in via `manualShift`;
  tap a shift to edit), a month calendar (`monthGrid`, colour by `shiftKind`), month hours/pay,
  share rota (`rotaText`), add all to calendar. Saved shifts now kept 5 weeks back for the calendar.
  The PC now sends `shifts` (its `ShiftStore.upcoming()`) in `/api/sync`; the phone merges them.
  "From my shift app" sets `phoneOnlyNext` so that one message is answered on the phone (the PC
  can't read phone apps). "From my calendar" shows the calendar's event names to tap when the
  words match nothing.
  Phone-only jobs: `needsPhone(text)` (shift app, rota, texts, Snapchat, alarms, Alexa…) and any
  chat that already did one (`phoneChats`) are answered on the phone even with the PC connected.
  `readApp` re-reads the first page every 2 s until `looksLoaded` (2+ times/dates, no "Loading"),
  up to ~25 s. Flow: app in front → tap the tab (`shiftTab`, else Schedule/Rota/My shifts) → read and
  scroll the week → scroll to top → `ScreenReader.tapNextWeek` (the `shiftNext` name, "Next"/›/>,
  else the nearest tappable thing right of the top date text) → read again, `shiftWeeks` (default 2)
  times. A "— next week —" line separates weeks; a `note` comes back if the next button wasn't found.
  The phone builds its system prompt once per reply (`ask`): it holds the time, and a changed prompt
  mid-reply makes the API reject the earlier thinking blocks (400 "block is bound…").
  "Send messages by themselves" (`S.autoMessages`, default on, Settings › Phone powers): in `ask`,
  message actions (reply, Snapchat, sms: link → `sendSms`, wa.me link → native `waSend`, which opens
  the chat and presses Send via the accessibility service) are sent inside the tool loop, the tool
  result becomes "SENT …" and the action gets `done` (shown as Sent ✓). Calls/emails stay buttons.
  Payday (Shifts › Alarms, pay & travel): `payNext` (a known payday), `payCycle` (7/14/28 days or
  0 = monthly), `payLag` (paid period ends N days before payday). `paydays`/`nextPayday`/`payPeriod`/
  `periodPay`/`ukTakeHome` in shifts.ts; Shifts tab payday card, 💷 on the calendar, the Claude
  context line, and "Add the next year of paydays to my calendar". Shifts are kept 10 weeks back.
  Interface options (0.52): `src/shared/ui-style.ts` (UiStyle, cleanUiStyle, UI_STYLE_GROUPS drives both
  apps' controls, applyUiStyle sets data-ui-* only for changed options) + `ui-style.css` (selectors for
  the phone's .card/.me/nav.tabs and the PC's .hud-panel/.chat-user/.tab-label/html.pc). Settings key
  `uiStyle` on both; the phone's old uiCompact maps to spacing. Space backgrounds: `spaceArt.ts`
  (canvas painter, ray-traced black hole; DOPPLER off = even film look); PC CSP needs img-src blob:.
  Layout (0.50.3): PC tab = "Connection" (Pair & sync, Wake the PC) then "Using your PC" inside `#pcLive`.
  Settings headings: About you & Alton · Phone (Phone access `powersGrp`, Messages, Alarms & Alexa, Watch &
  notifications, Hands-free & driving, Widgets — all `.app-grp`, shown in the app by renderPowers — then
  Smart home, Spending, Phone health) · Account & data · Updates (This app; Alton's code from a zip).
  Layout (0.49): tabs Chat · Today · Work · Lists · PC · Settings. Work = shifts, payday, calendar,
  get-my-shifts, Your shift app (moved from Phone powers) and At work list. Lists (`peopleView`, title
  "Lists") has segments Lists · Notes · People; Reminders sit under Lists. Settings has three
  headings: About you & Alton · Phone · Account & data.
  Shift app (owner's is a workforce app: bottom bar Home · Schedule · Requests · Shift Trade, Day/Week/
  Month tabs, "16 Nov to 22 Nov" with < > arrows): `AppReader` taps the tab with `ScreenReader.tapTab`
  (lowest match on screen = the nav bar), then "Week", reads, then `tapNextWeek` (date text only,
  not the word "week"). Its hours take a 15-min break off every shift: setting `breakAll`
  (`paidHours(s, brk, overHours)`).
  One-tap app updates: the update banner calls native `installUpdate` (GitHub .apk links only):
  downloads to the cache, opens the Install screen via the FileProvider (REQUEST_INSTALL_PACKAGES;
  first time it opens "Install unknown apps" for Alton). Falls back to the browser download.
  Rota while charging (`autoRota`, Phone powers): `ScreenReader` listens for ACTION_POWER_CONNECTED and
  tracks `lastActivity` (clicks/scrolls/typing/window changes); `AutoRota` waits until the phone is
  unlocked, on the home screen (or Alton), nothing playing, untouched 15 s, then holds a screen wake
  lock and runs `AppReader` (shared with `readApp`), saves the text and returns to Alton; JS
  `takeAutoRota` on resume sends it to Claude (phone-only) to add the shifts. Once per 20 h, or
  sooner after the shift app posts a notification (`MessageListener` → `AutoRota.notePosted`).
  Phone messages (0.56): why announcing failed before: off by default, silent on vibrate (now only full silent
  stops it), chat apps' newest message/sender not read (now MessagingStyle EXTRA_MESSAGES / conversation title /
  group flag), some apps not counted (known messaging packages now count), the listener dropped with no rebind
  (`MessageListener.rebind` → requestRebind), and no record. Every decision goes to `MsgLog` (Settings › Phone ›
  Messages: status, test announcement, Copy log). `Announcer`: favourites (one-to-one) word for word now, the rest
  batched into one summary at most every 10 min; codes hidden (`MsgLog.hideCodes` = shared `hideCodes`). `PcLink`
  posts each message to the PC (`/api/phone-messages`, pairing token stored natively, works with Alton closed) and
  for 5 min polls `/api/phone-replies` to send PC replies through the notification (result → `/api/phone-replies/
result`). PC: `services/phone-messages.ts` (read aloud via AppCommand 'speak' → renderer speakNow; busy = gaming or
  full-screen → holo notification + widget Phone tile; replies ask first unless the phone's autoMessages; confirms
  aloud), tools `summarise_messages` / `reply_phone_message`, context line, briefing line, settings `phoneMsgs`
  (Connections › Phone messages). Catch-up: `shared/catchup.ts` buildCatchup; PC on start (last-active.json) /
  resume / unlock after 15+ min; phone "While you were away" card on Today after 30+ min with Reply and Read it out.
  End-of-shift notes go through LateReceiver (msgs flag) so the messages line is added when they fire.
  Shared helpers `src/shared/messages.ts` (tests/messages.test.ts).
  Money (0.57, Work › Money card; phone tools `MONEY_TOOLS` in phone/src/tools.ts, run by `moneyTool` in main.ts,
  always answered on the phone via `moneyNext`): chat attachments now take PDFs too (`pending` data prefixed
  `pdf:` → a `document` block; PDFs never go to the PC). `save_payslip` → `comparePayslip` (rota hours for the
  period via periodPay + break setting, rate, gross and deductions maths, a manager message with a Copy button),
  history `S.payslips` (last 12) and `takeHomeRate` makes `payInfo().net` use the real take-home share
  (`netPay`). `make_listing` → Copy buttons (new PhoneAction `copy`) + Open Vinted/eBay. `spending_check` →
  `spendingCheck` (repeat payments, price rises, categories, "You pay for 2 music apps") from the bank
  notification log; statements are read by Claude directly. `watch_price` → `S.priceWatches`, checked on app
  open/resume when 20 h+ old (CapacitorHttp + `extractPrice` from JSON-LD/meta/itemprop; app only), drop →
  `notifyNow` "💷 Price drop: …" (`priceDrop`: 2 % and 50p minimum). Morrisons offers: a button asking Claude to
  check the Shopping list against offers with web search. Helpers `src/shared/money.ts` (tests/money.test.ts).
  No bank logins; data goes only to Claude.
  Watch heads-ups (0.54, Settings › Phone › Watch & notifications, all on by default): rota changes
  (`rotaChangeNotes(rotaChanges())` → `notifyNow`, from add_shifts and the calendar read), 30 min left +
  usual break (`breakAfter`), leave-by with trip weather (`tripWeather`, hourly forecast in morningExtras),
  payday eve/morning (payInfo), end-of-shift summary (replaces shiftEndNotes). "Running late": leave-by
  goes through `LateReceiver` (AlarmManager → notification with a Running late action → SmsManager);
  `lateTo` is a saved person or number. Shift reader step log: AppReader logs each step (ScreenReader.lastTap
  says what was tapped / which labels were seen), saved in prefs `alton_reader`; native `readLog`; shown
  under Work › What Alton read last time with Copy log.
  At work (0.53): set on a map (`phone/src/workmap.ts`, OSM tiles, CSP img-src tile.openstreetmap.org;
  search via Nominatim; S.workLat/workLon/workRadius) or "I'm there now". Android uses Play services
  geofencing (play-services-location) with the LocationManager proximity alert as fallback; the app also
  checks on open (`checkAtWorkNow` → native `placeCheck`). Glass options added: tint, border, colour boost, dim.
  At work (Settings › Phone powers › At work): "I'm there now" saves the spot natively
  (`setPlace`; `PlaceAlerts` uses `LocationManager.addProximityAlert`, `PlaceReceiver`; `BootReceiver`
  re-registers after a restart; needs background location). Arriving posts a notification with
  unticked items from `workLists` (pushed by `queueWorkSync` after `save()`) plus one-off notes from the
  `remind_at_work` tool. `shiftEndNotes` adds "Before you leave" notes 15 min before shift ends.
  `atWork` feeds the Claude context.
  Backgrounds: 15 CSS-only (`body[data-bg]`), `drift` animates (off for reduced motion).
  Phone health: `Diagnostics.java` readings → `src/shared/diagnostics.ts` (`healthReport`: issues
  with fixes) → the `phone_diagnostics` tool and Settings › Phone health.
  Remote control: PC setting `phoneControl` (off by default; notice on the PC when used),
  `/api/live` frames + `/api/input` (`src/shared/remote-input.ts`), phone overlay in the PC tab.
  Remote typing (0.50.2): phone keyboards re-send whole words while composing, so the phone keeps
  what was typed and sends only `typingDiff(sent, now)` (backspaces + new text), queued in order.
  Remote view: capture at up to 30 fps via requestVideoFrameCallback; `/api/live` waits up to 0.5 s
  for a frame newer than the last served (`frameSeq`/`servedSeq`); the phone keeps 3 requests in flight.
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
  0.50 life tools (pure logic in `src/shared`, tests in `tests/lifeTools.test.ts`):
  Sleep planner (`sleep.ts`: `planFor`/`nextSleep`/`sleepLine`/`shortGaps`; bed = alarm − `sleepHours`,
  wind-down `windDown` min before, a 90-min nap before night shifts, <11 h gaps flagged) → Work › Sleep
  card, Today line, Claude context, and `planHeadsUps(..., {sleep})` notifications (`S.sleepOn`).
  Spending (`spending.ts`: `parsePayment`/`paymentsFrom`/`spendSummary`): `SpendLog.java` keeps
  notifications from the bank apps picked in Settings › Phone › Spending (`setSpendApps`, prefs
  `alton_spend`, last 400, phone only; `MessageListener` calls it) → Today › Spending, `spending` tool,
  "since payday" from `paydays`. Smart home (`smartthings.ts`, one `smartHome(fetch, input, confirm)`
  for both apps; unlock/open always confirm): PC token encrypted (`smartthings-token.bin`, IPC
  `smarthome`, Settings › Connections › Smart home, tool `smart_home` in toolbox.ts); phone token in
  localStorage `alton-st` (not in backups), CapacitorHttp, Settings › Phone › Smart home. Shift
  trades (`shiftFit.ts`: clash / <11 h rest / >48 h week, pay and payday): `read_shift_trades` reads
  the `S.tradeTab` tab ("Shift Trade") via `readApp`, then `check_shift_fit`; Work › 🔁 button.
  Feature finder (`features.ts`, keep `where` in step with index.html): Settings search box filters
  the groups and links features on other tabs; `alton_features` tool for "what can you do?".
  Keyboard: targetSdk 35 draws edge to edge, so the keyboard overlays the WebView. `MainActivity.watchKeyboard`
  measures how much of the WebView the IME covers and sets `--kb` + `html.kb` (body padding, tab bar hidden);
  the page keeps the chat scrolled down on `altonkb`. Browsers use `visualViewport` instead.
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
- Desktop & taskbar (0.55): `src/main/desk.ts` (DeskService, started in ipc/index.ts via startDesk) builds one
  `DeskSnapshot` every 2 s from in-memory state and pushes it on change to the widget (#widget) and taskbar strip
  (#strip) windows; also drives the thumbnail toolbar, jump list (`--desk=…`, handled on launch and in
  second-instance), overlay badge, taskbar progress and the tray's live tooltip (tray.setLive / tray.deskAct).
  Pure logic in `src/shared/desk.ts` (tests/desk.test.ts); icons drawn in `desk-icons.ts`; live bits in
  `desk-state.ts` (renderer reports state via app.reportState; Agent Mode and the updater report too). Widget UI:
  `DeskView` in `components/hud/DesktopWidget.tsx` (also the Settings preview, `DeskSection.tsx`). Phone status
  (battery, unread, payday) comes with the phone's sync → `services/phone-status.ts`. Now playing reports
  position/duration and art (media-watch.ts). Telemetry keeps running while a desk window shows.
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
