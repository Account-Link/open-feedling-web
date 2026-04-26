# OpenFeedling v1 — self-host kit

## Goal
Public-release-grade port of `~/projects/teleport/feedling-web/` that anyone can clone, run, and use without provisioning a TEE permit.

## Architecture
- **Extension** (browser, MV3): keeps YouTube session cookies fresh on the user's server. `chrome.cookies.onChanged` (debounced) + 30min alarm → POST `/api/cookies` with shared-secret bearer.
- **Server** (Deno, always-on): holds latest cookie blob, polls YouTube InnerTube `/youtubei/v1/browse?browseId=FEhistory` with SAPISIDHASH auth on its own schedule. Same state engine + push triggers as feedling-web. Sees activity from any device on the user's account, even when the laptop is closed.
- **Trust model**: self-host. User clones repo, loads extension unpacked from same repo, points it at their own server. No third-party trust. (TEE-backed community deployment is a documented future, not v1.)

## Build checklist

- [x] `tasks/todo.md` — this plan
- [x] `LICENSE` (MIT), `.gitignore`, `.env.example`, `deno.json`, `Dockerfile`
- [x] `README.md` — pitch + quickstart + deploy + trust model
- [x] `server/state.ts`, `server/store.ts`, `server/push.ts`, `server/diary.ts` — port verbatim from feedling-web
- [x] `server/gen-vapid.ts` — port
- [x] `server/youtube.ts` — NEW, InnerTube client (lifted from `oauth3/yt-testing/test_tee_yt.sh` + parser from `setup_short_check.sh`)
- [x] `server/cookies.ts` — NEW, persistent cookie store
- [x] `server/handler.ts` — derived from `feedling-web/server.ts`: drop OAuth3, add `/api/cookies`, `/api/health`
- [x] `server/main.ts` — NEW, `Deno.serve` entry + setTimeout poll loop
- [x] `server/public/index.html` — port + cookie freshness indicator
- [x] `server/public/sw.js` — port verbatim
- [x] `extension/manifest.json` — MV3, `host_permissions` for youtube/google, `optional_host_permissions: <all_urls>`
- [x] `extension/service-worker.js` — cookie sync loop (alarm + onChanged debounced)
- [x] `extension/popup.html` + `extension/popup.js` — server URL + secret config, sync-now button, status

## Verification before "publishable"
- [ ] `deno task start` with no env → server boots, dashboard renders, says "no cookies yet"
- [ ] Generate VAPID keys via `deno task gen-vapid`
- [ ] Load extension unpacked, configure to localhost, hit Save & Sync → server logs cookie upload, `/api/health` shows fresh cookies
- [ ] `POST /api/poll-now` → InnerTube returns history, snapshot recorded
- [ ] Subscribe to push → `POST /api/test-push` arrives on the device
- [ ] Repeat with the server exposed via ngrok → confirm phone-side push works

## Out of scope (v1)
- Vercel/serverless (would need KV-backed state + Vercel Cron — meaningful refactor)
- TikTok client (extension already syncs TikTok cookies; server-side TikTok client is v0.2)
- Published extension build + Chrome Web Store submission
