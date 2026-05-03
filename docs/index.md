---
title: OpenFeedling
---

# OpenFeedling

Open-source YouTube Shorts doomscroll breaker + daily diary.

A self-hostable browser extension + server that watches your YouTube history and sends you a gentle push notification when you've been scrolling shorts too long. The cat gets tired so you don't have to.

- **Source code**: [github.com/teleport-computer/open-feedling-web](https://github.com/teleport-computer/open-feedling-web)
- **License**: MIT
- **Privacy policy**: [privacy](./privacy.html)

## How it works

1. Install the OpenFeedling extension in Chrome
2. Run the OpenFeedling server (your laptop, a VPS, Vercel, or your own dstack)
3. The extension keeps your YouTube cookies fresh on the server
4. The server polls YouTube on its own schedule and fires a Web Push when scrolling crosses a threshold
5. Push lands on whichever device you've subscribed (laptop, phone, or both)

The server is the always-on poller, so the loop break still fires when your laptop is closed and you're scrolling on your phone.

## Run it yourself (~5 minutes, Mac + Chrome)

You need a Chromium-based browser, [Deno](https://docs.deno.com/runtime/getting_started/installation/), and [git](https://git-scm.com/).

```bash
# 1. Install Deno if you don't have it
brew install deno

# 2. Clone and set up env
git clone https://github.com/teleport-computer/open-feedling-web.git
cd open-feedling-web
deno task gen-vapid > .env
echo "VAPID_SUBJECT=mailto:test@example.com" >> .env
echo "EXT_SHARED_SECRET=$(openssl rand -hex 32)" >> .env

# 3. Run the server
deno task start
# → listening on http://localhost:3000
```

Then in Chrome:

1. Go to `chrome://extensions` and toggle **Developer mode** (top right)
2. Click **Load unpacked** → select the `extension/` folder you just cloned
3. Click the OpenFeedling icon (pin it via the puzzle-piece menu for sanity)
4. Paste `http://localhost:3000` into "Server URL", paste your `EXT_SHARED_SECRET` from `.env` into "Shared secret", click **Save & sync now** — popup should report ✓ synced N cookies
5. Open `http://localhost:3000` → click **enable push** → grant the notification permission
6. Click **send test push** to confirm it works
7. Open YouTube, scroll a few shorts. The cat will fill up over the next few minutes.

### Add your phone (optional)

Web Push needs HTTPS or `localhost`. Your phone reaches your laptop at plain HTTP, which mobile browsers reject — so you need a tunnel:

```bash
brew install ngrok
ngrok http 3000
# → https://abc123.ngrok.app
```

Reload the dashboard at the ngrok URL, re-point the extension at it, click **share to phone** → scan the QR with your phone → tap **enable push** on your phone. Done — you'll get a notification on both devices.

## Trust model

This is a self-host kit — you run both the server and the extension; you control your cookies end-to-end. No third-party trust needed for the data path.

See the [README](https://github.com/teleport-computer/open-feedling-web#trust-model) for details on how this differs from a TEE-attested community deployment.
