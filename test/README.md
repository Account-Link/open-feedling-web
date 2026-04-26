# OpenFeedling end-to-end test

Spins up the server in Docker, launches a Playwright-controlled Chromium with the extension loaded and pre-recorded YouTube cookies pre-injected, then asserts the full chain works:

1. Extension's service worker POSTs cookies to `/api/cookies` (200, stored on disk)
2. Server calls YouTube InnerTube with those cookies and parses a real history (returns shorts count)
3. Dashboard subscribes to Web Push → server logs the FCM subscription
4. `/api/test-push` returns sent=1 with FCM status 201

No ngrok, no public exposure. Both containers share host network so the extension talks to `http://localhost:3000` (treated as a secure context by Chrome — push subscription works).

## One-time: record YouTube cookies

The test needs valid YouTube session cookies from a logged-in browser. Record them from your normal Chrome:

```bash
pip install browser_cookie3        # one-time
./record-cookies.sh > cookies.json
```

`cookies.json` is gitignored. Treat it like a credential.

For CI, push it to a repo secret:
```bash
gh secret set YT_COOKIES_JSON < cookies.json
```

When the test fails with `youtube returned not-logged-in`, your cookies expired — re-record, re-upload the secret. Expect to do this every few weeks.

## Run locally

```bash
cd test
export YT_COOKIES_JSON="$(cat cookies.json)"
docker compose up --build --abort-on-container-exit --exit-code-from e2e
```

Exits with code 0 on success. View the report at `test/playwright-report/`.

## Run in CI

See [`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml). Triggers on PR, weekly cron, and manual dispatch. Expects `YT_COOKIES_JSON` repo secret.

## Caveats

- **Linux-only Docker host networking.** macOS/Windows Docker Desktop don't support `network_mode: host`. CI runners are Linux so this is fine; for local Mac/Windows dev, run the server with `deno task start` and the test with `npx playwright test` directly (both natively, no Docker).
- **Push delivery is asserted server-side, not visually.** The test asserts the server received a 201 from FCM — it doesn't look for the notification rendering in headless Chromium (which is finicky). If FCM accepts the push, real Chrome and real phones will too.
- **VAPID keys in `docker-compose.yml` are throwaway test keys.** Don't reuse them in production.
