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

## Trust model

This is a self-host kit — you run both the server and the extension; you control your cookies end-to-end. No third-party trust needed for the data path.

See the [README](https://github.com/teleport-computer/open-feedling-web#trust-model) for details on how this differs from a TEE-attested community deployment.
