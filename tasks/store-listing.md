# Chrome Web Store listing — OpenFeedling

> Submission-ready copy and checklist. Bring this to the Developer Dashboard at https://chrome.google.com/webstore/devconsole.

## Pre-submission checklist

- [ ] Privacy policy hosted publicly. After enabling GitHub Pages from `/docs` on the repo, the URL will be: `https://teleport-computer.github.io/open-feedling-web/privacy.html`
- [ ] `extension/manifest.json` reviewed (already updated: dropped `<all_urls>` from optional perms; replaced with specific patterns)
- [ ] Tagged release on GitHub matching the version in `manifest.json` (v0.1.0)
- [ ] Screenshots captured (see "Screenshots" section below)
- [ ] Icon assets prepared (see "Assets" section below)
- [ ] `extension/` zipped (no `node_modules`, no `.DS_Store`) for upload

## Listing fields

### Name (≤ 45 chars)
```
OpenFeedling
```

### Summary / short description (≤ 132 chars)
```
Sync your YouTube cookies to your self-hosted OpenFeedling server so it can break your shorts doomscrolling loop.
```

### Detailed description

```
OpenFeedling is the open-source counterpart to the iOS Feedling app — a "live indicator" that gently breaks the YouTube Shorts doomscroll loop with web push notifications.

This extension is the cookie-sync companion to a self-hosted OpenFeedling server. The server polls your YouTube watch history on its own schedule and sends a push notification when it detects sustained shorts scrolling. Because the server runs independently, the loop break still fires when your laptop is closed and you're scrolling on your phone.

WHAT THIS EXTENSION DOES

• Reads your YouTube/Google session cookies (the small set needed for authenticated history-API calls)
• Sends them, over HTTPS, to a server URL that YOU configure
• Re-syncs every 30 minutes and whenever your cookies change

That's it. There is no analytics, no central account, no third-party data sharing.

WHAT YOU NEED

• A self-hosted OpenFeedling server (run locally, on a VPS, on Vercel, on Phala/dstack, or anywhere a Deno or Docker process can live). Setup instructions: https://github.com/teleport-computer/open-feedling-web

TRUST MODEL

This is a self-host kit. You run both the server and the extension; you control your cookies end-to-end. No third-party trust needed.

OPEN SOURCE

MIT-licensed. Full source at https://github.com/teleport-computer/open-feedling-web. Tagged releases match the version distributed here; reproducible-build instructions in the repo.

PRIVACY

Privacy policy: https://teleport-computer.github.io/open-feedling-web/privacy.html
```

### Category
- Primary: **Productivity**
- (Alternate if rejected from Productivity: **Lifestyle**)

### Language
English

## Single-purpose statement

```
Synchronize your YouTube session cookies to a self-hosted OpenFeedling server you control, so that server can monitor your shorts-watching activity on your behalf and send you Web Push notifications when sustained scrolling is detected.
```

## Permission justifications

Paste each into the corresponding field in the "Privacy practices" tab of the Developer Dashboard.

### `cookies` permission
```
The extension's sole purpose is to forward the user's YouTube/Google authentication cookies to a server they themselves run. This requires reading the named session cookies (SID, HSID, SAPISID, etc.) for youtube.com and google.com. No other cookies are accessed; no cookies are stored or transmitted anywhere outside the user's own server.
```

### `storage` permission
```
Stores two pieces of user-configured data locally via chrome.storage.local: (1) the URL of the user's self-hosted OpenFeedling server, and (2) the shared secret the server uses to authenticate cookie uploads. No other data is persisted.
```

### `alarms` permission
```
Schedules a periodic 30-minute alarm to re-sync cookies to the user's server, so the server's YouTube session stays fresh enough to call the InnerTube history API.
```

### Host permission `https://*.youtube.com/*`
```
Required by the chrome.cookies API to read the user's YouTube session cookies for upload to their own server.
```

### Host permission `https://*.google.com/*`
```
YouTube authentication cookies (SID, SAPISID, etc.) are scoped to .google.com as well as .youtube.com. Both domains must be readable to capture the complete authenticated session.
```

### Host permission `http://localhost/*`, `http://127.0.0.1/*`
```
Pre-granted access to localhost is needed so users can develop against and test their OpenFeedling server running on their own machine without an extra runtime prompt. These patterns only allow the extension to talk to its own user's localhost — they do not grant access to any external site.
```

### Optional host permission `https://*/*`
```
The user types the URL of their self-hosted server (which can have any HTTPS hostname) into the extension popup. The extension requests permission for that specific origin at runtime via chrome.permissions.request() — only for the URL the user has explicitly entered. The extension never accesses any URL the user has not configured.
```

## Data handling form (Privacy practices tab)

For each category, the answer is **NO** unless noted:

- Personally identifiable information: NO
- Health information: NO
- Financial and payment information: NO
- Authentication information: **YES** — "Authentication cookies for the user's own YouTube account, transmitted only to a server URL the user configures."
- Personal communications: NO
- Location: NO
- Web history: NO (the extension itself reads only cookies, not browsing history; the server reads YouTube history server-side using the synced cookies, but that happens on the user's own infrastructure outside this extension)
- User activity: NO
- Website content: NO

**Limited Use disclosures (check all):**
- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

## Visibility / distribution

For sevenfloor and team preview: **Unlisted**.
- Anyone with the install URL can install
- Not searchable in the store
- Real one-click store-install UX (no "developer mode" warning)
- Flip to Public later when local-mode ext lands and listing is dialed

## Screenshots needed

At least 1 required, up to 5 allowed. Recommended size: **1280×800**.

Capture in this order, save as PNG:

1. **`screenshot-1-popup.png`** — extension popup with example server URL filled in and "✓ synced N cookies" status visible. Use a synthetic example URL like `https://my-feedling.fly.dev`.
2. **`screenshot-2-dashboard.png`** — `http://localhost:3000` dashboard showing the cat (chill state), energy bar, recent shorts count, push enabled indicator.
3. **`screenshot-3-notification.png`** — actual macOS/Chrome notification banner from a test push: "5 minutes of solid scrolling. Cat noticed."
4. **`screenshot-4-share-qr.png`** — dashboard with the "share to phone" QR code expanded, ready for cross-device push setup.
5. *(Optional)* **`screenshot-5-architecture.png`** — a clean diagram of YouTube → server polls → push to devices. Can lift the ASCII one from the README into a proper graphic.

Save them in `docs/screenshots/` so they're versioned with the repo.

## Icon assets

`manifest.json` does not currently declare an `icons` block — needs adding before submission. The Web Store listing also requires a 128×128 store icon (separate from the in-Chrome icon).

Need to produce:
- `extension/icons/icon-16.png`
- `extension/icons/icon-48.png`
- `extension/icons/icon-128.png`
- `docs/store-icon-128.png` (for the listing — same as the 128×128 in-extension one is fine)

Then add to `manifest.json`:
```json
"icons": {
  "16": "icons/icon-16.png",
  "48": "icons/icon-48.png",
  "128": "icons/icon-128.png"
},
"action": {
  "default_popup": "popup.html",
  "default_title": "OpenFeedling",
  "default_icon": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

Suggested icon: a stylized cat 🐈 on the brand peach background (`#FF9B85`). 5 minutes in Figma or a quick vibes-coded SVG → PNG export.

## Submission packaging

```bash
# From repo root, after icons are in place:
cd extension
zip -r ../openfeedling-extension-v0.1.0.zip . \
  -x '*.DS_Store' -x 'node_modules/*' -x '.git/*'
```

Upload `openfeedling-extension-v0.1.0.zip` to the Developer Dashboard.

## Expected review back-and-forth

- **`https://*/*` host permission** is the most likely flag. The runtime-grant + popup-only-uses-user-typed-URL story addresses it; emphasize this in the justification.
- **Cookie permission scrutiny** — reviewers may ask for a screencast showing the data flow. Have one ready: 30s of installing, configuring, and seeing the cookies arrive on the server.
- **Auto-update vs trust model** — not a Web Store concern but worth being ready to articulate in any user-facing FAQ.

Typical first-review turnaround: 1-3 business days. Cookie+host-perm extensions sometimes take a week with one round of clarification.

## After approval

- [ ] Tag the repo at `v0.1.0` matching the published version, push the tag
- [ ] Add a "Install from Chrome Web Store" badge to the README pointing at the listing URL
- [ ] Add the listing URL to `docs/index.md`
- [ ] Update `tasks/sevenfloor-onboarding.md` to mention the unlisted install URL as the easiest install path
