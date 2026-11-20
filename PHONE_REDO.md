# Phone app redo: plan

**Status (0.25.1):** All phases done. The PC companion page no longer has the link-sync buttons
(it opens the phone app instead; old `#import=` links still work for one more version: remove
`takeImport` in remote-app.html and `takeHash` in phone/src/main.ts after that). Only real-device
testing on the owner's Samsung phone is left.

Read HANDOVER.md first. This is the plan for rebuilding the phone side, agreed with the owner.
Work in the order below, ship each phase as its own version, and verify on a simulated phone
(Playwright, `serviceWorkers: 'block'`, mocked Anthropic SSE) before handing over.

## Problems today

- **Two separate apps.** The phone-only app (`phone/`, GitHub Pages) and the PC companion page
  (`src/main/services/remote-app.html`, served by the PC on port 47615) look and behave
  differently, need pairing separately per address, and "switching" means jumping between
  sites. The Samsung browser blocks the background PC check unless the PC answers CORS and
  Private Network Access correctly.
- **Sync by links.** Phone ↔ PC sync travels in URL `#fragment`s (`encodeSync`/`decodeSync` in
  `src/shared/phone.ts`): the user has to tap "Update phone app" / "Send phone chats to PC",
  and each sync bounces between the two sites.
- **Updates.** After a push the phone keeps the old version until it's fully closed and
  reopened; there is no "update ready" message and no version shown.
- **Settings in two homes.** Pairing, the PC address (Tailscale HTTPS name), auto-switch and
  sync live in different places.

## Target

One phone app (the GitHub Pages one) that works on its own and, when the PC is reachable,
talks to the PC's API directly. No more jumping to the companion page (keep that page as a
fallback only).

### Phase 1: Direct PC connection

- PC (`remote-server.ts`): allow CORS for **exactly** the phone app's origin
  (`new URL(settings.phoneAppUrl).origin`) on `/api/*`, answer `OPTIONS` preflights, send
  `Access-Control-Allow-Private-Network: true`, allow the `Authorization` header. Keep the
  private/Tailscale-address-only rule and the pairing rate limit.
- Phone: "Connect to my PC" flow inside the app: PC address (Tailscale HTTPS,
  `https://<name>.<tailnet>.ts.net`, set up with `tailscale serve --bg 47615`) + the 6-digit
  code → token saved on the phone (never in the repo or URL). CSP `connect-src` already allows
  `https://*.ts.net`.
- A connection chip in the header: **PC connected** / **Phone only** (checked on open, on
  focus and every minute; reuse `checkPc` with the no-cors fallback).
- **Live sync over the API** instead of links: on open and every few minutes when connected,
  `GET /api/sync` (memories, lists, chats, notes, goals, shifts, prompts, look, voice fixes)
  and `POST /api/import` (phone chats, memories, list changes, notes, shifts). Merge with the
  existing helpers (`mergeChats`, `mergeLists`, `replaceRota`, `addFix`). Remove the link-based
  buttons once this works (keep import of old `#sync=` links for one version).
- **PC tab, native in the app** when connected: now playing + media keys, volume, lock, sleep,
  shut down / restart / cancel, Steam download mode, screen view, Agent Mode start/stop and its
  questions/approvals, "send a file to the PC". These routes already exist in
  `src/main/ipc/remote-api.ts` / `remote-server.ts`; call them with the token.
- Chats: when connected, the phone may send a message to the PC's Alton (full tools) instead of
  calling Claude directly; a toggle "Use my PC's Alton when it's on" (default on).

### Phase 2: Updates

- Build writes `docs/version.json` (`{ version, builtAt }`) from `package.json`.
- The phone app checks it on open and hourly; if newer, show a banner **"Update ready: tap to
  update"** that activates the waiting service worker (`skipWaiting` on message) and reloads.
- Show the version (phone app and connected PC) in Settings; "Check for updates" button.
- `sw.js`: precache the app shell with a versioned cache name; network-first for the HTML.

### Phase 3: UI redo

- Tabs: **Chat · Today · PC · People · Settings**. "Today" = next shift (Tomorrow/At work
  cards), reminders, weather, lists due; "PC" only when connected.
- One component set (cards, rows, toggles, buttons) styled like the PC HUD; consistent spacing
  for 360–430px widths; keyboard-safe composer; respects reduced motion.
- Settings grouped: Claude & spending · Voice · Look · Connection & sync · Backup · About.
- Keep every existing feature (shifts, alarms/Alexa card, camera, voice training, reminders,
  saved prompts, offline queue, PIN lock, backup, share target, shortcuts).

## Safety rules (unchanged)

Claude key only on the phone; PC secrets never leave the PC; pairing token hashed on the PC;
phone actions are buttons the user taps; no new outside services.

## Done means

- Phone with PC on: chip says **PC connected**, PC tab works, a list tick on the phone shows on
  the PC within a minute (and back), no link bouncing.
- PC off: app works fully in phone-only mode; chip says **Phone only**.
- After a push: the phone shows "Update ready" and updates with one tap.
- Typecheck, lint, all tests (add tests for CORS/preflight, sync merge, version check) and both
  builds pass.
