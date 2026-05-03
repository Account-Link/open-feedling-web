# Chrome Web Store listing — OpenFeedling v0.2.0

> Submission-ready copy and checklist. Bring this to the Developer Dashboard at https://chrome.google.com/webstore/devconsole.

## Pre-submission checklist

- [ ] Privacy policy is live at `https://teleport-computer.github.io/open-feedling-web/privacy.html`
- [ ] `extension/manifest.json` reviewed (v0.2.0; `notifications` permission added; push-service hosts added)
- [ ] Tagged release on GitHub matching the version in `manifest.json` (v0.2.0)
- [ ] Screenshots captured (see "Screenshots" section below)
- [ ] `openfeedling-extension-v0.2.0.zip` built (see "Submission packaging")

## Listing fields

### Name (≤ 45 chars)
```
OpenFeedling
```

### Summary / short description (≤ 132 chars)
```
Cat-themed nudge to break your YouTube Shorts doomscroll. Runs locally in your browser; optional phone notifications.
```

### Detailed description

```
OpenFeedling is a small browser extension that watches your YouTube history and gives you a gentle nudge when you've been scrolling Shorts too long. The cat gets tired so you don't have to.

HOW IT WORKS

Click the OpenFeedling icon and the popup shows your shorts-watched-today count along with the rest of your YouTube history. There's no setup, no account, no server to host — the extension reads your YouTube watch history directly using the cookies your browser already has.

Tick "Doomscroll notifications" and the extension polls your watch history every minute. After five consecutive minutes of new Shorts, your browser shows a native notification: "5 minutes of shorts. Cat says: please." That's the whole loop.

OPTIONAL: PAIR YOUR PHONE

If you want the same nudge on your phone, click "Pair phone" in the popup. The dashboard generates a QR code; scan it with your phone, tap Subscribe, and you're done. From then on, the extension also delivers the same notification to your phone via web push.

The phone-pairing handshake uses a one-time public ntfy.sh topic; ongoing notifications go directly from your extension to your phone's push service via VAPID. No third party stays in the loop.

OPTIONAL: BRING-YOUR-OWN SERVER

Power users can run an included Deno server on Vercel, Render, or their own VPS for cross-device cookie sync (the server polls on its own schedule even when your laptop is asleep). Configurable in the extension's advanced settings. Most users do not need this.

PRIVACY

In the default extension-only mode with no phone paired, no data leaves your browser. With a phone paired, ~300 bytes of push-subscription metadata transit ntfy.sh once at pairing time. With a BYO server, your YouTube cookies go to a server you operate. Nothing else, ever — no analytics, no central account, no third-party data sharing.

OPEN SOURCE

MIT-licensed. Full source at https://github.com/teleport-computer/open-feedling-web. Tagged releases match the version distributed here.

PRIVACY POLICY

https://teleport-computer.github.io/open-feedling-web/privacy.html
```

### Category
- Primary: **Productivity**
- (Alternate if rejected from Productivity: **Lifestyle**)

### Language
English

## Single-purpose statement

```
Detect sustained YouTube Shorts watching by reading the user's own YouTube history (via the user's existing browser cookies, locally), and notify the user via a browser notification — and optionally a paired phone — so they can break the doomscroll loop.
```

## Permission justifications

Paste each into the corresponding field in the "Privacy practices" tab of the Developer Dashboard.

### `cookies` permission
```
The extension reads the user's own YouTube/Google session cookies for two purposes: (1) so the extension's own popup/dashboard can fetch the user's YouTube watch history (this is the primary feature), and (2) optionally — only when the user configures a BYO server in advanced settings — to forward those same cookies to a server the user operates. The extension reads only the named session cookies (SID, HSID, SAPISID, etc.) for youtube.com and google.com. No cookies are stored by the extension or transmitted anywhere except either (i) the user's own browser fetch to youtube.com, or (ii) a server URL the user themselves configured.
```

### `storage` permission
```
Stores via chrome.storage.local: the user's most recent YouTube history snapshot (so the popup is instant), a per-install VAPID keypair used to authenticate the extension to web-push services for paired phones, the paired phone's push subscription endpoint (~300 bytes), and (only if the user configures BYO server) the server URL and shared secret. No browsing history, identifiers, or analytics.
```

### `alarms` permission
```
Schedules two periodic alarms: a one-minute alarm to poll the user's own YouTube history (so the doomscroll detector can run while the popup is closed), and a 30-minute alarm to re-sync cookies to the user's BYO server when configured.
```

### `notifications` permission
```
The extension's primary feature is a notification fired by chrome.notifications.create() when the user has been watching YouTube Shorts continuously for the configured threshold (default: 5 minutes of new Shorts in a row). The user opts in via the "Doomscroll notifications" toggle in the popup; with the toggle off, no notifications are ever shown.
```

### Host permission `https://*.youtube.com/*`
```
The extension fetches the user's own YouTube watch-history page (https://www.youtube.com/feed/history) directly from the extension's service worker, with the user's existing browser cookies, and parses the embedded ytInitialData. This is how the extension counts shorts.
```

### Host permission `https://*.google.com/*`
```
YouTube authentication cookies (SID, SAPISID, etc.) are scoped to .google.com as well as .youtube.com. Both domains must be readable so the user's authenticated YouTube session is complete when the extension fetches the watch-history page.
```

### Host permission `https://fcm.googleapis.com/*`, `https://updates.push.services.mozilla.com/*`, `https://web.push.apple.com/*`
```
When the user pairs a phone, the extension delivers web-push notifications directly to the user's own push subscription endpoint, which lives on one of the standard browser push services (FCM for Chrome/Edge, Mozilla autopush for Firefox, Apple for Safari). The fetch is signed with the extension's VAPID JWT and only targets the specific subscription endpoint the user paired. No other URL on these hosts is accessed.
```

### Host permission `http://localhost/*`, `http://127.0.0.1/*`
```
Pre-granted access to localhost so users running a local OpenFeedling server in the optional BYO-server mode don't see an extra runtime prompt. These patterns only allow the extension to talk to the user's own localhost.
```

### Optional host permission `https://*/*`
```
If the user opts into the BYO-server flow and types the URL of their self-hosted server (which can have any HTTPS hostname), the extension requests permission for that specific origin at runtime via chrome.permissions.request() — only for the URL the user has explicitly entered. The extension never accesses any URL the user has not configured.
```

## Data handling form (Privacy practices tab)

For each category, the answer is **NO** unless noted:

- Personally identifiable information: NO
- Health information: NO
- Financial and payment information: NO
- Authentication information: **YES** — "Authentication cookies for the user's own YouTube account, used by the extension's own service worker to fetch the user's watch history page; transmitted to a third party only if the user explicitly configures a BYO server URL."
- Personal communications: NO
- Location: NO
- Web history: **YES** — "The user's own YouTube watch history, read by the extension via an authenticated fetch to youtube.com/feed/history. Held only in chrome.storage.local; not transmitted anywhere."
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
- Flip to Public later when v0.2 is broadly tested

## Screenshots needed

At least 1 required, up to 5 allowed. Recommended size: **1280×800**.

Capture in this order, save as PNG into `docs/screenshots/`:

1. **`screenshot-1-popup.png`** — extension popup with the status pill populated ("N shorts today · M in history") and the three controls visible (Open dashboard, Doomscroll notifications, Pair phone).
2. **`screenshot-2-dashboard.png`** — full dashboard tab (chrome-extension://...) with the cat header, today's shorts count, a populated history list, and the Share-to-phone card.
3. **`screenshot-3-notification.png`** — a real notification banner from the OS: "5 minutes of shorts. Cat says: please."
4. **`screenshot-4-pair-qr.png`** — the dashboard's QR code visible during a pair flow, showing "waiting for phone" status.
5. *(Optional)* **`screenshot-5-architecture.png`** — clean diagram of "extension polls YouTube → detects streak → notifies laptop AND/OR paired phone."

## Icon assets

Already in place at `extension/icons/icon-{16,48,128}.png`. Web Store also wants a 128×128 listing icon (separate from the in-extension icon) — `docs/store-icon-128.png` already exists in the repo from v0.1.

## Submission packaging

```bash
# From repo root
cd extension
git ls-files | zip -X ../openfeedling-extension-v0.2.0.zip -@
```

The `git ls-files | zip -@` form ships exactly what's tracked in git — no `.DS_Store`, no editor temp files, no test-install clones.

## Expected review back-and-forth

- **`https://*/*` optional host permission** is the most likely flag. The runtime-grant + popup-only-uses-user-typed-URL story addresses it; emphasize this in the justification.
- **Cookie + history permissions** — reviewers may ask why the extension reads YouTube cookies. Answer: to fetch the user's own watch-history page from inside the user's own browser, which is the entire functional core of the extension. Have a 30s screencast ready of the popup populating with real numbers.
- **Push service host permissions** — newer in v0.2.0; standard for any web-push extension. The justification copy above frames it correctly.

Typical first-review turnaround: 1-3 business days. Extensions that read auth cookies sometimes take a week with one round of clarification.

## After approval

- [ ] Tag the repo at `v0.2.0` matching the published version, push the tag
- [ ] Add a "Install from Chrome Web Store" badge to the README pointing at the listing URL
- [ ] Add the listing URL to `docs/index.md`
- [ ] Update onboarding docs to mention the unlisted install URL as the easiest install path
