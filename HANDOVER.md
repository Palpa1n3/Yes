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
  framework-free `engines.ts` shared with the phone; moods/motion in `avatarKit.ts`). The same
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
