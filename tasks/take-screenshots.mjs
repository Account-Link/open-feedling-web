// Render the popup and dashboard with mocked state, save 1280×800 PNGs to docs/screenshots/.
// Requires: cd test && npm i  (Playwright is already there).
//
// Usage: node tasks/take-screenshots.mjs

import { chromium } from "../test/node_modules/playwright/index.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "docs/screenshots");
fs.mkdirSync(OUT, { recursive: true });

const dashboardHtml = fs.readFileSync(path.join(ROOT, "server/public/index.html"), "utf8");
const popupHtml = fs.readFileSync(path.join(ROOT, "extension/popup.html"), "utf8");
const popupJs = fs.readFileSync(path.join(ROOT, "extension/popup.js"), "utf8");

// Realistic snapshot data: ~2 hours of polls, latest few showing activity
const now = Date.now();
const snaps = [];
for (let i = 24; i >= 0; i--) {
  const at = now - i * 5 * 60_000;
  const watching = i < 4;
  snaps.push({
    at,
    shortsCount: 80 + (24 - i) * 2,
    newShorts: watching ? 3 : 0,
    watching,
  });
}

const MOCK = {
  "/api/state": {
    state: {
      stateCode: "chill",
      vibe: "cozy and content",
      energy: 42,
      continuousMinutes: 12,
      shortsToday: 47,
      computedAt: now - 30_000,
    },
    snaps,
    session: {
      startedAt: now - 12 * 60_000,
      lastActivityAt: now - 30_000,
      minutes: 12,
      consecutiveActivePolls: 4,
      cumulativeActivePolls: 7,
    },
    cookies: { present: true, updatedAt: now - 5 * 60_000, ageMs: 5 * 60_000 },
    poll: {
      lastPollAt: now - 60_000,
      nextPollAt: now + 4 * 60_000,
      lastPollOk: true,
      lastPollError: "",
      pollIdleMs: 300_000,
      pollActiveMs: 60_000,
    },
  },
  "/api/diary": {
    diary:
      "The afternoon settled in around 2pm. You opened YouTube, drifted into a few cooking shorts, then surfaced when the cat blinked at you. Forty-seven shorts today, mostly clusters of three or four before a break. Energy is steady. The cat is dozing on the windowsill, content.",
  },
  "/api/subs": {
    subs: [
      {
        host: "fcm.googleapis.com",
        fingerprint: "aFx8tQ3pK9wL",
        endpoint: "https://fcm.googleapis.com/fcm/send/AAAA-BBBB-CCCC-DDDD-EEEE-FFFF",
        createdAt: now - 3 * 86_400_000,
      },
      {
        host: "updates.push.services.mozilla.com",
        fingerprint: "Z9pK4nQ2vRm",
        endpoint: "https://updates.push.services.mozilla.com/wpush/v2/...",
        createdAt: now - 86_400_000,
      },
    ],
  },
  "/api/vapid-key": { key: "BJxmockVAPIDPublicKeyForScreenshotsOnlyDoNotUse" },
};

// Tiny mock server: serves dashboard HTML + canned API JSON.
const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  if (url === "/" || url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(dashboardHtml);
    return;
  }
  if (MOCK[url]) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(MOCK[url]));
    return;
  }
  res.writeHead(404);
  res.end();
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const dashboardUrl = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

// === 1. Dashboard, quiescent state ===
{
  const page = await ctx.newPage();
  await page.goto(dashboardUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(800); // let setInterval/render settle
  await page.screenshot({ path: path.join(OUT, "screenshot-2-dashboard.png"), fullPage: false });
  console.log("✓ screenshot-2-dashboard.png");
  await page.close();
}

// === 2. Dashboard with share-to-phone QR open ===
// Patch window.location.origin to look like an ngrok URL so the QR is meaningful.
{
  const page = await ctx.newPage();
  // Intercept the dashboard load and rewrite the share-to-phone JS to use a fake ngrok origin.
  await page.route(dashboardUrl, async (route) => {
    let body = dashboardHtml.replace(
      /const url = window\.location\.origin;/,
      `const url = 'https://abc123.ngrok.app';`,
    );
    await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body });
  });
  await page.goto(dashboardUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.click("#shareBtn");
  // Wait for QR image to render (esm.sh import + toDataURL).
  await page.waitForSelector("#shareQR img", { timeout: 15_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, "screenshot-4-share-qr.png"), fullPage: false });
  console.log("✓ screenshot-4-share-qr.png");
  await page.close();
}

// === 3. Popup, configured + synced ===
// Stub chrome.* APIs so popup.js can load and render.
{
  const page = await ctx.newPage();
  // Render the popup centered on a peach background card so it fills the 1280×800 frame nicely.
  const frame = `<!doctype html><html><head><meta charset="utf-8">
    <style>
      body{margin:0;background:#FFF9F0;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;}
      .card{background:#fff;border-radius:24px;box-shadow:0 12px 48px rgba(255,155,133,0.18);padding:24px;}
      .label{position:absolute;top:48px;left:0;right:0;text-align:center;color:#FF9B85;font-weight:700;font-size:1.6rem;letter-spacing:-0.02em;}
      .sub{position:absolute;top:88px;left:0;right:0;text-align:center;color:#8A8A8A;font-size:0.95rem;}
      iframe{border:0;width:340px;height:300px;border-radius:16px;display:block;}
    </style></head><body>
    <div class="label">OpenFeedling</div>
    <div class="sub">configure once, then forget — the cat handles the rest</div>
    <div class="card"><iframe src="data:text/html;base64,${Buffer.from(buildPopupWithStubs()).toString("base64")}"></iframe></div>
  </body></html>`;
  await page.setContent(frame, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "screenshot-1-popup.png"), fullPage: false });
  console.log("✓ screenshot-1-popup.png");
  await page.close();
}

// === 4. Notification placeholder ===
// Build a mock macOS notification banner so the listing has all 4 shots.
{
  const page = await ctx.newPage();
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <style>
      body{margin:0;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);font-family:-apple-system,system-ui,sans-serif;display:flex;align-items:flex-start;justify-content:flex-end;min-height:100vh;padding:32px;}
      .notif{background:rgba(40,40,40,0.92);backdrop-filter:blur(20px);color:#fff;padding:14px 16px;border-radius:14px;width:380px;box-shadow:0 16px 48px rgba(0,0,0,0.5);display:flex;gap:12px;}
      .icon{width:42px;height:42px;border-radius:10px;flex-shrink:0;}
      .body{flex:1;}
      .title{font-weight:600;font-size:14px;margin-bottom:2px;}
      .text{font-size:13px;opacity:0.92;line-height:1.35;}
      .meta{font-size:11px;opacity:0.55;margin-top:4px;}
      .caption{position:absolute;bottom:48px;left:0;right:0;text-align:center;color:#fff;opacity:0.7;font-size:14px;letter-spacing:0.02em;}
    </style></head><body>
    <div class="notif">
      <img class="icon" src="data:image/png;base64,${fs.readFileSync(path.join(ROOT, "extension/icons/icon-128.png")).toString("base64")}">
      <div class="body">
        <div class="title">openfeedling</div>
        <div class="text">5 minutes of solid scrolling. Cat noticed.</div>
        <div class="meta">now</div>
      </div>
    </div>
    <div class="caption">a gentle nudge when the cat thinks you've had enough</div>
  </body></html>`;
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, "screenshot-3-notification.png"), fullPage: false });
  console.log("✓ screenshot-3-notification.png");
  await page.close();
}

await browser.close();
server.close();

function buildPopupWithStubs() {
  // Inline chrome.* stubs before popup.js so popup renders as if configured + synced.
  const stubs = `
    <script>
      const STORE = {
        serverUrl: 'https://my-feedling.fly.dev',
        secret: '••••••••••••••••••••••••••••••••',
        lastSync: ${Date.now() - 42_000},
        lastSyncOk: true,
        lastSyncStatus: 200,
        lastSyncCount: 14,
        lastSyncError: '',
      };
      window.chrome = {
        storage: { local: { get: async (keys) => {
          const out = {};
          for (const k of (Array.isArray(keys) ? keys : [keys])) out[k] = STORE[k];
          return out;
        }, set: async (obj) => { Object.assign(STORE, obj); } } },
        runtime: { sendMessage: async () => ({ ok: true, count: 14 }) },
        permissions: { request: async () => true },
      };
    </script>`;
  return popupHtml.replace(
    `<script src="popup.js"></script>`,
    `${stubs}\n<script>${popupJs}</script>`,
  );
}
