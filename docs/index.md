---
title: OpenFeedling
---

A browser extension that watches your YouTube history and gives you a gentle nudge when you've been scrolling Shorts too long. The cat gets tired so you don't have to.

- **Source code**: [github.com/teleport-computer/open-feedling-web](https://github.com/teleport-computer/open-feedling-web)
- **License**: MIT
- **Privacy policy**: [privacy](./privacy.html)

## How it works

1. Install the extension. Click its icon — it shows your YouTube watch history right there.
2. Tick **"Doomscroll notifications"**. The extension polls your history every minute and fires a native browser notification after five consecutive minutes of new Shorts.
3. Optionally, scan a QR with your phone to also receive the notification on mobile.

Everything runs locally in your browser. No server to host, no cookies to sync, no tunnels. The optional phone-pairing handshake uses [ntfy.sh](https://ntfy.sh) once at pairing time; ongoing pushes go straight from your extension to your phone's push service via VAPID.

## Install (~2 minutes)

The Chrome Web Store listing is coming. For now, load the extension from a local clone:

```bash
git clone https://github.com/teleport-computer/open-feedling-web.git
```

In Chrome (or any Chromium browser):

1. Open `chrome://extensions` and toggle **Developer mode** (top right).
2. Click **Load unpacked** and pick the `extension/` folder you just cloned.
3. Pin the OpenFeedling icon via the puzzle-piece menu.
4. Click the icon. The popup should populate with your shorts-today / total-in-history count within ~1 second.

That's it. No setup, no config.

## Turn on notifications

In the popup, tick **Doomscroll notifications**. From now on, when the extension detects five consecutive minutes of new Shorts in your watch history, your laptop browser shows a native notification: *"5 minutes of shorts. Cat says: please."*

To test it: open `youtube.com/shorts` and scroll continuously for 5 minutes. (Or click **Open dashboard** → **send test notification** to verify your browser actually shows them.)

## Add your phone (optional)

1. In the popup, click **📱 Pair phone**. A dashboard tab opens with a QR code.
2. Scan the QR with your phone camera. A page on this site (`/pair/`) explains what's about to happen.
3. Tap **Subscribe to alerts** on your phone and grant the notification permission.
4. Within a few seconds the extension picks up the pairing. The dashboard transitions to "✓ phone subscribed".
5. Click **Send test push** in the dashboard. Your phone should show a real native notification.

The pairing handshake uses a one-time [ntfy.sh](https://ntfy.sh) topic. Once your phone is paired, ongoing pushes go directly from your extension to FCM (or Mozilla autopush, or Apple) using a VAPID-signed JWT — nothing routes through ntfy after pairing.

## Want a nudge while your laptop is off? (BYO server)

Extension-only mode only fires while the browser is running. If you also want notifications while you're scrolling on your phone with the laptop closed, something has to be polling YouTube on your behalf 24/7.

The included Deno server does that. Deploy it to Vercel, Render, or your own VPS, click ⚙ in the popup, paste the URL + a shared secret. The server keeps your YouTube session warm and fires the nudge to your paired devices regardless of whether your laptop is awake.

The trade-off is honest: your YouTube cookies now live on a machine that isn't only yours. The cleanest answer to that trust question is to deploy on a TEE-attested host (e.g. [Phala dstack](https://docs.phala.network/)) so anyone can verify the deployed code never logs or replays your session — that's the direction this project is heading. For now, BYO Vercel/VPS is the practical option.

Most users don't need this. The default extension-only flow already covers "nudge me when I'm wasting time on this laptop."

## Trust model

This extension polls your YouTube history directly from your own browser using your existing session cookies. None of that data leaves your machine unless you opt into one of:

- **Phone pairing**: ~300 bytes of push-subscription metadata transit ntfy.sh once at pairing time.
- **BYO server**: your cookies go to a server you operate.

In the default extension-only flow with no phone paired, no third party touches your data.
