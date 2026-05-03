import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH = process.env.EXT_PATH || path.resolve(__dirname, "..", "extension");
const COOKIES_PATH = path.resolve(__dirname, "cookies.json");

async function bootContext() {
  const cookies = fs.existsSync(COOKIES_PATH) ? JSON.parse(fs.readFileSync(COOKIES_PATH, "utf8")) : [];
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openfeedling-ext-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      "--headless=new",
      "--no-sandbox",
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
    ],
  });
  if (cookies.length) await context.addCookies(cookies);
  const wake = await context.newPage();
  await wake.goto("about:blank");
  const sw = context.serviceWorkers()[0]
    ?? (await context.waitForEvent("serviceworker", { timeout: 20_000 }));
  const extensionId = new URL(sw.url()).host;
  await wake.close();
  return { context, extensionId };
}

test("popup loads without JS errors; toggle persists", async () => {
  const { context, extensionId } = await bootContext();
  const popup = await context.newPage();
  const errs: string[] = [];
  popup.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  popup.on("console", (m) => { if (m.type() === "error") errs.push(`console.error: ${m.text()}`); });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  // Pill should resolve to either real data (if YT auth worked) or the not-signed-in error string.
  await expect(popup.locator("#pill")).toContainText(/shorts today|not signed in/, { timeout: 15_000 });
  const pillText = await popup.locator("#pill").innerText();
  console.log(`[popup] pill: ${pillText}`);

  // Toggle persists
  await popup.locator("#notify").check();
  await expect(popup.locator("#confirm")).toContainText("on", { timeout: 5_000 });

  expect(errs, `popup logged errors: ${errs.join("\n")}`).toEqual([]);
  await context.close();
});

test("dashboard loads + test-notification routes through SW without crashing (regression for chrome.notifications.create undefined)", async () => {
  const { context, extensionId } = await bootContext();
  const dash = await context.newPage();
  const errs: string[] = [];
  dash.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  dash.on("console", (m) => { if (m.type() === "error") errs.push(`console.error: ${m.text()}`); });
  await dash.goto(`chrome-extension://${extensionId}/dashboard.html`);

  // Wait for the dashboard JS to settle (refresh() runs and either succeeds or shows error in #subline)
  await expect(dash.locator("#subline")).not.toHaveText("loading...", { timeout: 15_000 });

  // The actual bug regression: clicking testNotify previously threw because chrome.notifications was undefined
  // in the dashboard page context. The fix routes via the SW.
  await dash.click("#testNotify");
  await dash.waitForTimeout(1000);
  expect(errs, `dashboard logged errors: ${errs.join("\n")}`).toEqual([]);

  // Verify SW handled it: storage should be untouched (no error stored), and chrome.notifications.create
  // was actually invoked in the SW (we can't directly observe a notification from headless, but absence
  // of any console error in the dashboard page is the regression check).
  await context.close();
});

test("share-to-phone: Generate QR creates VAPID keys, topic, and renders QR img", async () => {
  const { context, extensionId } = await bootContext();
  const dash = await context.newPage();
  const errs: string[] = [];
  dash.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  dash.on("console", (m) => { if (m.type() === "error") errs.push(`console.error: ${m.text()}`); });
  await dash.goto(`chrome-extension://${extensionId}/dashboard.html`);
  await expect(dash.locator("#phoneStatus")).toContainText("not paired", { timeout: 15_000 });

  await dash.click("#startPair");
  await expect(dash.locator(".qr-wrap img")).toBeVisible({ timeout: 5_000 });
  const qrSrc = await dash.locator(".qr-wrap img").getAttribute("src");
  expect(qrSrc, "QR should be a data URL").toMatch(/^data:image\//);

  const linkText = await dash.locator(".qr-link").innerText();
  expect(linkText, "pair URL must include topic and pk").toMatch(/topic=feedling-[a-f0-9]+/);
  expect(linkText).toMatch(/pk=[A-Za-z0-9_-]+/);

  const stored = await dash.evaluate(() =>
    chrome.storage.local.get(["pairTopic", "vapidPrivateJwk", "vapidPublicB64"])
  );
  expect(stored.pairTopic, "topic stored").toMatch(/^feedling-[a-f0-9]{16}$/);
  expect(stored.vapidPublicB64, "VAPID public stored").toMatch(/^[A-Za-z0-9_-]+$/);
  expect(stored.vapidPrivateJwk, "VAPID private JWK stored").toBeTruthy();
  expect(stored.vapidPrivateJwk.crv, "P-256 curve").toBe("P-256");

  expect(errs, `errors: ${errs.join("\n")}`).toEqual([]);
  await context.close();
});

test("share-to-phone: ntfy round-trip — extension picks up a posted subscription", async () => {
  const { context, extensionId } = await bootContext();
  const dash = await context.newPage();
  await dash.goto(`chrome-extension://${extensionId}/dashboard.html`);
  await expect(dash.locator("#phoneStatus")).toContainText("not paired", { timeout: 15_000 });
  await dash.click("#startPair");
  await expect(dash.locator(".qr-wrap img")).toBeVisible({ timeout: 5_000 });

  const stored = await dash.evaluate(() => chrome.storage.local.get(["pairTopic"]));
  const topic: string = stored.pairTopic;
  expect(topic).toMatch(/^feedling-/);

  // Simulate the phone POSTing its subscription blob to the ntfy topic
  const fakeSub = {
    endpoint: "https://fcm.googleapis.com/fcm/send/round-trip-fake-id-12345",
    keys: { p256dh: "BHello-test-p256dh-key", auth: "test-auth-secret" },
  };
  const post = await fetch(`https://ntfy.sh/${topic}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fakeSub),
  });
  expect(post.ok, `ntfy POST should succeed (got ${post.status})`).toBe(true);

  // Extension polls every 3s — give it ~5s to pick up
  await expect(dash.locator("#phoneStatus")).toContainText("phone subscribed", { timeout: 12_000 });
  await expect(dash.locator("#testPhone")).toBeVisible();
  const final = await dash.evaluate(() => chrome.storage.local.get(["phoneSub", "pairTopic"]));
  expect(final.phoneSub.endpoint).toBe(fakeSub.endpoint);
  expect(final.pairTopic, "pairTopic should be cleared after pickup").toBeUndefined();
  await context.close();
});

test("share-to-phone: test-phone-push reaches FCM (regression for missing fcm.googleapis.com host permission)", async () => {
  const { context, extensionId } = await bootContext();
  const dash = await context.newPage();
  await dash.goto(`chrome-extension://${extensionId}/dashboard.html`);
  await dash.evaluate(() => chrome.storage.local.set({
    phoneSub: {
      // Real FCM origin so the SW's fetch hits the actual endpoint. Path is
      // bogus so FCM will return 404 — that's fine; we only care that the
      // request *reaches* FCM (no CORS / host_permission failure).
      endpoint: "https://fcm.googleapis.com/fcm/send/host-perm-regression-fake-id",
      keys: { p256dh: "BHello-test-p256dh-key", auth: "test-auth-secret" },
    },
  }));
  await dash.reload();
  await expect(dash.locator("#phoneStatus")).toContainText("phone subscribed", { timeout: 10_000 });
  await dash.click("#testPhone");
  await expect(dash.locator("#phoneStatus")).not.toHaveText("sending…", { timeout: 15_000 });
  const status = await dash.locator("#phoneStatus").innerText();
  // Acceptable: either ✓ sent (impossible with fake) or ✗ push service <2xx-4xx>.
  // Forbidden: ✗ fetch failed (means CORS / host_permission missing).
  expect(status, "must reach FCM, not CORS-block").not.toMatch(/fetch failed|Failed to fetch/i);
  expect(status, "should report a real push-service status").toMatch(/sent|push service \d{3}/);
  await context.close();
});

test("share-to-phone: paired state shows test/forget; forget clears storage", async () => {
  const { context, extensionId } = await bootContext();
  const dash = await context.newPage();
  await dash.goto(`chrome-extension://${extensionId}/dashboard.html`);
  // Inject a fake phoneSub directly
  await dash.evaluate(() => chrome.storage.local.set({
    phoneSub: {
      endpoint: "https://fcm.googleapis.com/fcm/send/fake-test-id",
      keys: { p256dh: "AAA", auth: "BBB" },
    },
  }));
  await dash.reload();
  await expect(dash.locator("#phoneStatus")).toContainText("phone subscribed", { timeout: 10_000 });
  await expect(dash.locator("#testPhone")).toBeVisible();
  await expect(dash.locator("#forgetPhone")).toBeVisible();

  await dash.click("#forgetPhone");
  await expect(dash.locator("#phoneStatus")).toContainText("not paired", { timeout: 5_000 });
  const after = await dash.evaluate(() => chrome.storage.local.get(["phoneSub"]));
  expect(after.phoneSub, "phoneSub should be cleared").toBeUndefined();

  await context.close();
});

test("notifyEnabled flag persists across popup → dashboard", async () => {
  const { context, extensionId } = await bootContext();
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator("#pill")).toContainText(/shorts today|not signed in/, { timeout: 15_000 });
  await popup.locator("#notify").check();
  await expect(popup.locator("#confirm")).toContainText("on", { timeout: 5_000 });
  await popup.close();

  const dash = await context.newPage();
  await dash.goto(`chrome-extension://${extensionId}/dashboard.html`);
  await expect(dash.locator("#subline")).not.toHaveText("loading...", { timeout: 15_000 });
  const stored = await dash.evaluate(() => chrome.storage.local.get(["notifyEnabled"]));
  expect(stored.notifyEnabled, "toggle should have persisted").toBe(true);
  await context.close();
});
