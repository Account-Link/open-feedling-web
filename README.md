# OpenFeedling

A self-hosted, web-based feedling — the open analog of the iOS [Feedling](https://feedling.app) app.

Doomscroll → cat gets tired → web push notification gently breaks the loop.

## Why

Algorithmic feeds (YouTube Shorts, TikTok) are tuned for engagement, not your wellbeing. Feedling-style interventions show that a small, well-timed nudge from a "live indicator" — a virtual cat that mirrors your scrolling — measurably interrupts the loop. This repo is the simplest open implementation: a tiny server that watches your YouTube history and a browser extension that keeps the server's session fresh.

## Architecture

```
  YouTube ◄──── server polls every 1–5 min
     ▲              │
     │              ▼
  cookies     state engine + push triggers
     ▲              │
     │              ▼
 extension ─── Web Push to your devices
   (cookie sync)        (phone, laptop, ...)
```

The extension's only job is to keep your YouTube session cookies fresh on the server. The server uses those cookies to call YouTube's history API on its own schedule — so the loop break still fires when your laptop is closed and you're scrolling on your phone.

## Trust model

This is a **self-host kit**. You run both the server and the extension; you control your cookies end-to-end. No third-party trust needed.

A community deployment (where users install a published extension and point it at someone else's server) would require a TEE-attested instance — see [OAuth3](https://oauth3.network) — so users can verify the server isn't logging or replaying their session. That path is documented but not in scope for v1.

## Quickstart

```bash
git clone https://github.com/teleport-computer/open-feedling-web.git
cd openfeedling
cp .env.example .env

# 1. Generate Web Push keys + a shared secret
deno task gen-vapid >> .env
echo "EXT_SHARED_SECRET=$(openssl rand -hex 32)" >> .env

# 2. Run the server
deno task start
# → listening on http://localhost:3000
```

Then:

3. **Load the extension.** Open `chrome://extensions`, toggle Developer mode on, click "Load unpacked", select the `extension/` folder of this repo.
4. **Configure it.** Click the extension icon → enter `http://localhost:3000` and the `EXT_SHARED_SECRET` from `.env` → Save & Sync. The popup should report "synced N cookies".
5. **Open the dashboard.** Visit `http://localhost:3000`, click "enable push", grant the notification permission.
6. **Scroll some Shorts.** Within ~5 minutes the cat's energy will rise; with sustained activity, you'll get a nudge.

## Deploy

OpenFeedling needs an **always-on** host (the server holds an in-memory poll loop). Anywhere with HTTPS and a long-running Deno or Docker process works:

| Target | Notes |
|---|---|
| **Fly.io** | `fly launch` with the included `Dockerfile`. Persistent volume → mount at `/data`. |
| **Railway / Render** | Docker deploy, attach a persistent disk, set env vars. |
| **VPS / Raspberry Pi** | `deno task start` behind nginx + Let's Encrypt. |
| **ngrok** | Easiest way to test the phone push flow against a local server. |
| **Cloud + your VPN** | See [`deploy/`](./deploy/) — opt-in compose stack with an OpenVPN→SOCKS5 sidecar so YouTube sees your VPN provider's IP instead of the cloud host's datacenter IP. Bring your own `.ovpn` (ProtonVPN, Mullvad, AirVPN, ...). |

Vercel / Cloudflare Workers / Lambda are not a good fit for v1 (the architecture assumes a long-running poll loop with local state). A Vercel Cron + KV refactor is a future direction.

> Whichever host you pick, the URL must be HTTPS in production. Web Push subscriptions silently fail on plain HTTP unless `localhost`.

## Configuration

See [`.env.example`](./.env.example).

| Variable | Required | Default |
|---|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | yes | — |
| `EXT_SHARED_SECRET` | yes | — |
| `OPENROUTER_API_KEY` | no | (disables LLM diary if blank) |
| `DIARY_MODEL` | no | `anthropic/claude-sonnet-4-5` |
| `PORT` | no | `3000` |
| `DATA_DIR` | no | `./data` |
| `POLL_IDLE_MS` / `POLL_ACTIVE_MS` | no | `300000` / `60000` |

## Credits

OpenFeedling is the open-source counterpart to **Feedling** (iOS), and a concretization of the information-diet research framework being developed in [feedling-paper](https://github.com/...). The shorts-detection logic is adapted from the [OAuth3](https://oauth3.network) `yt-shorts-v3` capability — here applied directly without the TEE delegation layer, since you're hosting the trust boundary yourself.

## License

MIT — see [`LICENSE`](./LICENSE).
