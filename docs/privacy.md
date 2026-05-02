---
title: OpenFeedling Privacy Policy
---

# OpenFeedling — Privacy Policy

**Effective date:** 2026-05-02

OpenFeedling is an open-source self-hosted tool. The data flow is determined by the source code published at [github.com/teleport-computer/open-feedling-web](https://github.com/teleport-computer/open-feedling-web) under an MIT license, which you can audit in full.

## What the extension does with your data

The OpenFeedling browser extension reads a small set of your YouTube and Google session cookies (the ones needed to authenticate against YouTube's history API) and sends them, over HTTPS, to a server URL that **you** configure in the extension's popup. It does not send your data anywhere else.

Specifically:

| Data | Where it goes | Why |
|---|---|---|
| YouTube/Google session cookies | The server URL you configure | So your server can poll your YouTube history on your behalf |
| Your configured server URL | Stored locally in `chrome.storage.local` on your device | So the extension knows where to sync next time |
| The shared secret you generate | Stored locally in `chrome.storage.local` on your device | Authenticates cookie uploads to your server |

The extension does not collect, store, or transmit any other personal information. It does not use analytics. It does not communicate with any third-party service other than the server URL you provide.

## What your server does with your data

The OpenFeedling server (which **you** host) uses your cookies to poll YouTube's InnerTube history endpoint on a schedule, computes activity statistics, and sends Web Push notifications to devices you've explicitly subscribed. Snapshots are kept on your server's filesystem for 24 hours by default. Push subscriptions and the most recent cookie blob are persisted on your server until you delete them.

Your server may also call your configured LLM provider (OpenRouter, optional) to generate diary text. If you configure this, your activity statistics — never your raw cookies — are sent to that provider.

## Permissions the extension requests, and why

| Permission | Why |
|---|---|
| `cookies` | Read your YouTube/Google session cookies (the named cookies needed for authenticated InnerTube calls) |
| `storage` | Save your server URL and authentication secret locally on your device |
| `alarms` | Re-sync cookies every 30 minutes so your server's session stays fresh |
| `host_permissions: youtube.com, google.com` | Required to read the cookies for the YouTube account you're signed into |
| `host_permissions: http://localhost, http://127.0.0.1` | Talk to a local OpenFeedling server during development without an extra prompt |
| `optional_host_permissions: https://*/*` | Send cookies to the server URL you configure. Granted at runtime, only for the URL you type into the popup. |

## What we don't do

- We do not collect any data on a central server. There is no central OpenFeedling server.
- We do not use third-party analytics, telemetry, or tracking pixels.
- We do not sell or share your data with anyone — there is nothing to sell, because we never receive your data.
- We do not deliver advertising.
- We do not transmit your browsing history beyond the YouTube cookie sync described above.

## Data retention and deletion

All persistent data lives on infrastructure you control:

- Local browser storage (extension config) — clear by uninstalling the extension or via Chrome's clear-storage flow
- Your self-hosted server — clear by deleting the server's data directory or shutting down the server

There is no centrally hosted account or remote storage to delete from.

## Open source and verifiability

The full source code is at [github.com/teleport-computer/open-feedling-web](https://github.com/teleport-computer/open-feedling-web) under the MIT license. You can verify the behavior described above by reading the source. Tagged releases on GitHub are intended to match the version distributed via the Chrome Web Store; reproducible-build instructions are in the repo.

## Contact

Questions, security reports, or privacy concerns: file an issue at [github.com/teleport-computer/open-feedling-web/issues](https://github.com/teleport-computer/open-feedling-web/issues).

## Changes to this policy

If this policy changes, the updated version will be published at this URL and the effective date above will be updated. The change history is visible in the git history of `docs/privacy.md` in the repository.
