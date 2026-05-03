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
