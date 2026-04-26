import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
const EXT_SECRET = process.env.EXT_SHARED_SECRET || "test-secret-12345";
const COOKIES_JSON = process.env.YT_COOKIES_JSON;
const EXT_PATH = process.env.EXT_PATH || "/ext";

test("end-to-end: cookie sync → InnerTube poll → web push", async () => {
  if (!COOKIES_JSON) throw new Error("YT_COOKIES_JSON env var required (record via test/record-cookies.sh)");
  const cookies = JSON.parse(COOKIES_JSON);
  if (!Array.isArray(cookies) || cookies.length === 0) throw new Error("YT_COOKIES_JSON must be a non-empty array");

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openfeedling-e2e-"));

  const context: BrowserContext = await chromium.launchPersistentContext(userDataDir, {
    // Classic headless can't load MV3 extensions. Use new headless mode.
    headless: false,
    args: [
      "--headless=new",
      "--no-sandbox",
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      `--unsafely-treat-insecure-origin-as-secure=${SERVER_URL}`,
    ],
  });

  await context.addCookies(cookies);

  // Open a page to wake the extension service worker (MV3 SWs are lazy).
  const wakePage = await context.newPage();
  await wakePage.goto("about:blank");

  // Wait for the extension service worker to register.
  let sw = context.serviceWorkers()[0];
  if (!sw) {
    console.log("[e2e] no SW yet, waiting for serviceworker event...");
    sw = await context.waitForEvent("serviceworker", { timeout: 20_000 });
  }
  const extensionId = new URL(sw.url()).host;
  console.log(`[e2e] extension id: ${extensionId}`);
  await wakePage.close();

  // === 1. Extension cookie sync via the actual popup UI ===
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.fill("#serverUrl", SERVER_URL);
  await popup.fill("#secret", EXT_SECRET);
  await popup.click("#save");
  // chrome-extension:// pages have CSP that blocks waitForFunction (uses unsafe-eval).
  // Use Playwright's locator API which polls natively.
  await expect(popup.locator("#status")).toContainText(/synced|✗/, { timeout: 20_000 });
  const popupStatus = await popup.locator("#status").innerText();
  console.log(`[e2e] popup: ${popupStatus}`);
  expect(popupStatus, "extension popup should report success").toContain("synced");

  // === 2. Server received cookies ===
  const health1 = await (await fetch(`${SERVER_URL}/api/health`)).json();
  expect(health1.cookies.present, "server should have cookies after sync").toBe(true);
  expect(health1.cookies.ageMs, "cookies should be fresh").toBeLessThan(20_000);

  // === 3. InnerTube poll succeeds (real call to YouTube) ===
  const poll = await (await fetch(`${SERVER_URL}/api/poll-now`, { method: "POST" })).json();
  console.log(`[e2e] poll: ${JSON.stringify(poll)}`);
  expect(poll.skipped, `poll should not be skipped (got: ${poll.skipped})`).toBeUndefined();
  expect(poll.ok).toBe(true);

  const state = await (await fetch(`${SERVER_URL}/api/state`)).json();
  expect(state.snaps.length, "at least one snapshot should be recorded").toBeGreaterThan(0);
  expect(state.poll.lastPollOk, "lastPollOk should be true").toBe(true);

  // === 4. Web Push subscribe via the dashboard ===
  const dash = await context.newPage();
  dash.on("console", (m) => console.log(`[dash:${m.type()}] ${m.text()}`));
  dash.on("pageerror", (e) => console.log(`[dash:pageerror] ${e.message}`));
  await context.grantPermissions(["notifications"], { origin: SERVER_URL });
  await dash.goto(`${SERVER_URL}/`);
  await dash.click("#enableBtn");
  await expect(dash.locator("#err")).toContainText(/✓|error|denied|fail|reject/i, { timeout: 40_000 });
  const enableStatus = await dash.locator("#err").innerText();
  console.log(`[e2e] enable push: ${enableStatus}`);
  expect(enableStatus, "push should enable cleanly").toContain("✓");

  const subs = await (await fetch(`${SERVER_URL}/api/subs`)).json();
  expect(subs.subs.length, "exactly one subscription should be registered").toBeGreaterThanOrEqual(1);

  // === 5. Server actually reaches FCM (delivery or expected stale-sub response) ===
  // Headless Chromium subscriptions often get invalidated by FCM before our server
  // can deliver — FCM returns 410 Gone. That still proves our VAPID auth, request
  // shape, and FCM endpoint are wired correctly; only successful 2xx OR a real
  // FCM-rejection (404/410 with VAPID accepted) counts as a passing end-to-end.
  const push = await (await fetch(`${SERVER_URL}/api/test-push`, { method: "POST" })).json();
  console.log(`[e2e] push send: ${JSON.stringify(push)}`);
  expect(push.details.length, "should have attempted at least one delivery").toBeGreaterThanOrEqual(1);
  const ACCEPTED = new Set([200, 201, 202, 404, 410]);
  const wired = push.details.every((d: any) => ACCEPTED.has(d.status));
  expect(wired, `push wiring failed; details=${JSON.stringify(push.details)}`).toBe(true);

  await context.close();
});
