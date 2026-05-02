# OpenFeedling — onboarding for sevenfloor

> Hey — this doc is for you. Browse it with your Claude Code if you want; it'll walk through setup and orient you to where the code lives. PRD seed is in [`prd-v0.2.md`](./prd-v0.2.md).

## What this is

Open-source YouTube Shorts doomscroll breaker + daily diary. v0.1 ships today as a self-host kit (Deno server + Chrome MV3 extension); v0.2 wants TikTok + XHS adapters (your work) and a local-mode extension that doesn't need a server at all.

Trust spectrum:
- **Local-mode ext (v0.2)** — install + click. No server. Best UX, best trust, laptop-only coverage.
- **Hosted TEE instance (future)** — sign up, attested. Strong trust + full coverage. Out of scope for this repo; lives in adjacent infra.
- **Self-host (today)** — clone + deploy. What this README walks through.

## 5-minute install (Mac + Chrome)

```bash
# Prereqs
brew install deno

# Repo
git clone git@github.com:teleport-computer/open-feedling-web.git
cd openfeedling

# .env — clean recipe (don't `cp .env.example .env` first; the gen-vapid append duplicates)
deno task gen-vapid > .env
echo "VAPID_SUBJECT=mailto:test@example.com" >> .env
echo "EXT_SHARED_SECRET=$(openssl rand -hex 32)" >> .env

# Run
deno task start
# → listening on http://localhost:3000
```

Then in Chrome:

1. `chrome://extensions` → toggle **Developer mode** (top right)
2. **Load unpacked** → select the `extension/` folder
3. Click the OpenFeedling icon (puzzle piece menu → pin it for sanity)
4. Paste `http://localhost:3000` into "Server URL" + paste your `EXT_SHARED_SECRET` into "Shared secret" → **Save & sync now**
5. Popup should say "✓ synced N cookies"
6. Open `http://localhost:3000` → click **enable push** → grant notification permission
7. Click **send test push** → notification fires on your Mac. ✅

**Quick smoke test of the real loop:** open YouTube, scroll a few shorts, then click **poll now** on the dashboard. Within ~5 min of normal use you should see the cat's energy bar tick up; sustained scrolling fires a real push.

## Add your phone (optional)

Push subscription needs HTTPS or `localhost`. Your phone reaches your Mac at `http://192.168.x.x:3000` which gets rejected — same-wifi alone isn't enough.

```bash
brew install ngrok    # or: brew install cloudflared
ngrok http 3000
# → https://abc123.ngrok.app
```

1. Reload the dashboard at the ngrok URL on your laptop
2. Re-point the ext popup at the ngrok URL (so cookie sync goes through it too)
3. Click **share to phone** on the dashboard → QR code appears
4. Scan with iPhone camera → tap the link → tap **enable push** on your phone

Test push now fires on both devices. Phone-scrolling-while-laptop-closed coverage requires the always-on server — that's the v0.2 Vercel upgrade path, not for this onboarding.

## Your work

You're adding **TikTok** and **XHS** adapters. Each is roughly a port of `server/youtube.ts` against that platform's history API.

**Touch points per adapter:**

| File | What changes |
|---|---|
| `server/youtube.ts` → `server/tiktok.ts` (new) | InnerTube call → TikTok `/watch/history/list/v1/` (lift from `oauth3-wallet-extension/tiktok.js` or `xordi-tokscope/lib/web-api-client.ts`) |
| `server/handler.ts` `tick()` | Call each enabled adapter, merge snapshots |
| `extension/manifest.json` | Add `https://*.tiktok.com/*` and `https://*.xiaohongshu.com/*` to `host_permissions` |
| `extension/service-worker.js` | Cookie-sync loop iterates the new domains |
| `extension/popup.html` | Per-platform enable toggles |

**Don't pre-build a `SiteAdapter` interface.** When the second adapter actually lands the seam will pull itself apart from `youtube.ts`. (We discussed this in the PRD seed — the abstraction-first approach is busywork.)

**Reference implementations to crib from:**
- `~/projects/teleport/oauth3-wallet-extension/tiktok.js` — TikTok web API client, MV3-ready
- `~/projects/teleport/oauth3-wallet-extension/youtube.js` — InnerTube call, MV3-ready (parallel structure to copy from)
- `~/projects/teleport/xordi-tokscope/lib/web-api-client.ts` — TikTok client used in production TEE
- XHS — no prior art in the monorepo, will need fresh DOM/API spelunking. Start with `tokscope-signinwith` for the QR-auth pattern if you go DOM-scraping.

## What downstream users will eventually see

You're seeing the dev-mode version (unpacked extension, localhost server). Two upgrade paths users will get later — useful to keep in mind so the dev-mode UX rhymes with the final UX:

**Chrome Web Store version (v0.2 Workstream B):**
- One-click install from store, no dev mode
- First-run flow: popup says "Local mode on. Notifications when you scroll." — no URL field at all
- "Server mode" is a hidden second screen for power users

**Hosted TEE instance (future, separate infra):**
- Visit a hosted URL → see attestation badge → sign in (passkey/QR)
- Server-side polling + push, your cookies live in the enclave
- ext just routes cookies to the hosted URL — same code as today's self-host

The current dev-mode dashboard `server/public/index.html` is what'll become the hosted-instance UI. The current popup is what'll become the store-distributed extension. So when you touch UX, design for both.

## Code map for Claude Code

```
server/
├── main.ts            # entry, poll loop scheduler
├── handler.ts         # HTTP routes, calls tick(), the orchestrator
├── state.ts           # state machine (energy, drained, night_owl, …) — site-agnostic, port to your adapters as-is
├── push.ts            # VAPID signing + Web Push delivery
├── youtube.ts         # ◄ this is the file your adapters parallel
├── cookies.ts         # persistent cookie store
├── store.ts           # snapshots/subs/pushlog persistence
├── diary.ts           # OpenRouter LLM diary (optional)
└── public/
    ├── index.html     # dashboard (with QR-share button)
    └── sw.js          # service worker for Web Push reception

extension/             # MV3, "load unpacked"
├── manifest.json      # permissions + host matches
├── service-worker.js  # cookie sync loop (chrome.alarms + chrome.cookies.onChanged)
├── popup.html / .js   # config UI

deploy/                # docker-compose with OpenVPN→SOCKS5 sidecar, optional
test/                  # Playwright E2E harness
tasks/
├── prd-v0.2.md        # ◄ read this for the design context
├── sevenfloor-onboarding.md  # this file
└── todo.md            # v0.1 build checklist (mostly done)
```

**Where to start reading if you have 10 min:**
1. `server/state.ts` (~150 lines) — the brain
2. `server/youtube.ts` — the file you'll parallel
3. `server/handler.ts` `tick()` — see how state + youtube + push compose
4. `extension/service-worker.js` — what the ext currently does

## Questions / issues

Drop them in `tasks/` as `notes-sevenfloor.md` or just edit this file. Andrew is around for design questions; PRD seed has open questions for product spec.
