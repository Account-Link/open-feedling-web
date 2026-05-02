# OpenFeedling v0.2 — PRD seed

> Status: design-space exploration, pre-PRD. Hand to sevenfloor for product spec.

## One-line positioning

**Open-source YouTube Shorts doomscroll breaker + daily diary.** Self-hostable. Optional integration with the user's local agent.

## What v0.1 is today

Self-host kit, shipped 2026-04-26:
- Deno server polls YouTube InnerTube on the user's behalf, runs a state machine, fires Web Push
- Chrome MV3 extension keeps cookies fresh on the server
- Optional `deploy/` compose stack with OpenVPN→SOCKS5 sidecar for cloud egress
- E2E Playwright spec, verified end-to-end

Audience: a few hundred HN-ish self-hosters. To use it today you need: a terminal, an always-on box, Chrome dev mode, ~30-60 min.

## v0.2 thesis

**The browser extension should be the product, not the cookie-sync utility for the server.** The server becomes an optional upgrade for users who want phone-scrolling coverage.

### Trust ↔ UX ↔ coverage spectrum

| Tier | UX | Trust | Coverage | When it ships |
|---|---|---|---|---|
| **0. Local-mode ext** | install + click enable | best (no third party touches cookies) | laptop-only | v0.2 |
| **1. TEE-hosted central** | sign up | strong (remote attestation) | full | future, *deferred to existing TEE infra (Feedling backend, xordi pattern)* |
| **2. Self-host server** | fork + deploy (Vercel/Fly/VPS) | medium (vendor sees cookies) | full | v0.2 (Vercel adapter) |
| **3. Self-host on own dstack** | fork + Phala CVM | strong + self-trust | full | community/future |

### Growth ramp the user actually walks

1. **Day 1** — Install ext from Chrome Web Store. Click enable. Notifications fire while you laptop-scroll. Zero signup, zero config.
2. **Day 2 (optional)** — "I scroll on my phone too" → upgrade path: sign up on hosted instance, OR deploy your own (Vercel button + paste secret).
3. **Day N (rare, paranoid)** — Self-host on your own dstack / VPS / hardware.

## v0.2 scope

### Workstream A: Local-mode extension *(headline)*

The extension absorbs the server's poll loop + state engine + push delivery. No server required for laptop-scrolling coverage.

**Technical feasibility audit:**
- `chrome.alarms` 1-min minimum → fine for 1-5 min poll cadence
- Service worker can `fetch()` YouTube InnerTube directly with cookies
- WebCrypto P-256 + `fetch` to FCM/autopush → ext can sign and send VAPID Web Push itself
- `chrome.storage.local` → snapshots, subs, push log (few MB; plenty for 24h window)
- LLM diary via OpenRouter call from SW (optional)

**What the ext gives up vs server:**
- Doesn't catch phone-scrolling when laptop is closed (the always-on property is what the server provides)
- Multi-device push subscriptions need a QR-pair flow

### Workstream B: Chrome Web Store submission

- Privacy policy page (GitHub Pages or project site)
- Single-purpose listing copy
- Drop `optional_host_permissions: <all_urls>` → request user-typed server URL at runtime via `chrome.permissions.request()`
- Tagged GitHub releases with reproducible build script (so paranoid users can hash-verify the store binary)
- 15s screencast: cat fills up → notification fires

### Workstream C: Vercel adapter

The "Day 2 upgrade" deploy target. KV-backed storage shim so `server/store.ts` and `server/cookies.ts` work on Vercel KV / Upstash. Vercel Cron hits `/api/poll-now`. Pro plan needed for sub-day cron cadence.

Same `server/handler.ts` runs in both modes — the only divergence is the storage layer.

## Explicitly out of scope for v0.2

- **Multi-tenant TEE service.** Already exists in adjacent infrastructure (Feedling backend, xordi-tokscope pattern, oauth3-wallet-extension). openfeedling's job is the OSS / self-host counterpart, not to compete.
- **Site adapter abstraction (TikTok / Reddit / etc.).** Internal refactor with no user-facing benefit at v0.2 scale. Will fall out naturally if a second adapter ever lands.
- **Multi-device QR pairing for the ext-only path.** v0.3 polish.

## Open questions for sevenfloor

1. **Onboarding copy.** Local-mode-first reframes the project — README, listing, screencast all need rewriting around "doomscroll antidote that runs on your machine," not "self-host kit."
2. **Server-mode upsell timing.** When does the ext suggest deploying a server? (After N days of use? When user opens phone-pairing flow? Never, unless asked?)
3. **Hosted instance positioning.** If a TEE-hosted "OpenFeedling Cloud" ships from the existing TEE infra, how does the ext discover/connect to it? Hardcoded URL? Per-deployment config?
4. **Privacy policy minimum.** The Web Store wants one. Tightest possible scope: "ext reads YouTube cookies, sends them to a user-configured URL (or stores them locally), nothing else."
5. **Reproducible build pipeline.** What's the lightest-weight way to give "tagged release == store binary" verifiability? Likely a CI job that builds the .crx and posts the hash to the release.

## Sevenfloor onboarding recipe (Mac + Chrome, today)

**Just laptop:**
```bash
brew install deno
git clone <repo> && cd openfeedling
cp .env.example .env
deno task gen-vapid >> .env
echo "EXT_SHARED_SECRET=$(openssl rand -hex 32)" >> .env
deno task start
```
Then load `extension/` unpacked in Chrome (`chrome://extensions` → dev mode → "load unpacked"), open the popup, paste `http://localhost:3000` + the `EXT_SHARED_SECRET`, click "Save & sync." Visit `http://localhost:3000` → click "enable push" → start scrolling shorts. Push fires on her Mac within ~5 min.

**Adding her phone (same wifi *isn't enough*):**

Web Push subscription requires HTTPS or `localhost`. Her phone reaches her laptop at `http://192.168.x.x:3000`, which is plain HTTP and gets rejected by mobile Chrome/Safari. Same-wifi alone won't work.

Recipe that works:
```bash
brew install ngrok
ngrok http 3000
# → https://abc123.ngrok.app
```

Then she:
1. Reloads the dashboard via the ngrok URL on her laptop
2. Re-points the extension popup at the ngrok URL (so cookie sync goes through it too)
3. Clicks "share to phone" on the dashboard — gets a QR code (now wired into the dashboard)
4. Scans QR with iPhone camera, opens the dashboard on her phone, taps "enable push"

After that, push fires on both devices. Phone-scrolling-while-laptop-closed coverage requires the always-on server though (see Day-2 upsell).

## Chinese market notes

The TikTok / XHS adapters sevenfloor adds will broaden the audience to Chinese platforms, which raises a real distribution question:

- **Desktop browsers in China (~30-40% combined share):** 360 Browser, QQ Browser, Sogou, UC, Edge — all Chromium-based. Most accept Chrome-format `.crx`. Microsoft Edge Add-ons store is reachable from China; Chrome Web Store is patchy.
- **Mobile browsers in China:** ~no extension support on any mainstream Chinese mobile browser. Since XHS usage is overwhelmingly mobile, ext-only path covers only the desktop-XHS slice (~15-25% of XHS users).
- **Tactical answer for v0.2:** publish to Chrome Web Store + Edge Add-ons, ship a signed `.crx` for direct sideload, document install in 360/QQ browsers.
- **For real Chinese-market parity:** eventually need a non-extension cookie source — TEE-hosted login flow (xordi pattern) or mobile app intent. Past v0.2.

## Openclaw integration

Users on a journey with us may install **openclaw** (their local agent harness). openfeedling should integrate naturally:

**MCP server exposing openfeedling state.** Tools the agent gets:
- `getState()` — current cat state, energy, vibe
- `getRecentSnapshots(limit)` — last N polls
- `getDiary(force?)` — daily diary entry
- `getPushLog(limit)` — what's been pushed and when
- `recordReflection(text)` — write back to the diary (two-way)

This turns push from one-shot intrusion into a real conversation: "openclaw, how was my screen time yesterday?" → agent reads the diary, engages with what you scrolled, can suggest actions.

**Agent as Day-2 deploy helper.** Hand openclaw a GitHub PAT + Vercel token, it forks the repo, deploys to Vercel, configures the ext for you. Eliminates the "fork + deploy" friction step entirely.

**Future: agent-mediated interventions.** Instead of (or alongside) push, the agent watches the user's openfeedling state via MCP and engages directly when scroll thresholds hit — "I see you've been scrolling 30 min — what are you avoiding?" Much richer than a cat notification.

The MCP server is small (~one file) and naturally lives next to the existing HTTP API. Could ship in v0.2 alongside the local-mode ext.

## Reference points

- `server/state.ts` — state machine, fully site-agnostic, ports cleanly to ext SW
- `server/push.ts` — VAPID signing, ports to WebCrypto in SW
- `server/youtube.ts` — InnerTube client, runs as-is in ext
- `extension/service-worker.js` — current cookie-sync SW, becomes the local-mode brain
- xordi-tokscope `tokscope-enclave/` — pattern to mirror if the hosted TEE instance ever lands here
- oauth3-wallet-extension — existing precedent for cookie injection across YouTube/TikTok via CDP
