import {
  fetchHistory, parseHistory, snapshotFromSections, newShortsCount,
  getOrCreateVapidKeypair, sendWebPush,
} from "./lib.js";

const SYNC_ALARM = "openfeedling-sync";
const POLL_ALARM = "openfeedling-poll";
const COOKIE_NAMES = new Set([
  "SID", "HSID", "SSID", "APISID", "SAPISID",
  "__Secure-1PSID", "__Secure-3PSID",
  "__Secure-1PAPISID", "__Secure-3PAPISID",
  "LOGIN_INFO", "PREF", "SIDCC",
  "__Secure-1PSIDCC", "__Secure-3PSIDCC",
  "__Secure-1PSIDTS", "__Secure-3PSIDTS",
]);

const STREAK_THRESHOLD = 5;
const POLL_PERIOD_MIN = 1;

chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 30 });
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: POLL_PERIOD_MIN });
  refreshSnapshot();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: POLL_PERIOD_MIN });
  refreshSnapshot();
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === SYNC_ALARM) syncCookies();
  if (a.name === POLL_ALARM) refreshSnapshot();
});

let debounceTimer = null;
chrome.cookies.onChanged.addListener((change) => {
  const d = change.cookie.domain || "";
  if (!d.includes("youtube.com") && !d.includes("google.com")) return;
  if (!COOKIE_NAMES.has(change.cookie.name)) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(syncCookies, 500);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.action === "sync-now") {
    syncCookies()
      .then((r) => sendResponse({ ok: true, ...r }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.action === "refresh-snapshot") {
    refreshSnapshot()
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.action === "notify-on" || msg?.action === "notify-off") {
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.action === "test-notification") {
    try {
      chrome.notifications.create(`test-${Date.now()}`, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
        title: "OpenFeedling",
        message: "Test notification — this is what doomscroll alerts look like.",
        priority: 1,
      });
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String(e.message || e) });
    }
    return false;
  }
  if (msg?.action === "test-phone-push") {
    pushPhone().then((r) => sendResponse(r)).catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
});

async function pushPhone() {
  const { phoneSub } = await chrome.storage.local.get(["phoneSub"]);
  if (!phoneSub) return { ok: false, error: "no phone paired" };
  const vapid = await getOrCreateVapidKeypair();
  return await sendWebPush(phoneSub, vapid);
}

async function refreshSnapshot() {
  try {
    const { data, loggedIn } = await fetchHistory();
    if (!loggedIn) {
      await chrome.storage.local.set({ lastSnapshotError: "not signed in to YouTube" });
      return;
    }
    const sections = parseHistory(data);
    const snap = snapshotFromSections(sections);
    const prev = (await chrome.storage.local.get(["lastSnapshot"])).lastSnapshot;
    await chrome.storage.local.set({ lastSnapshot: snap, lastSnapshotError: "" });
    if (prev) await maybeNotify(snap, prev);
  } catch (e) {
    await chrome.storage.local.set({ lastSnapshotError: String(e.message || e) });
  }
}

async function maybeNotify(curr, prev) {
  const newCount = newShortsCount(curr.allIds, prev.allIds || []);
  const { notifyEnabled, streak = 0, streakFired = false } = await chrome.storage.local.get([
    "notifyEnabled", "streak", "streakFired",
  ]);
  const nextStreak = newCount > 0 ? streak + 1 : 0;
  let nextFired = streakFired;
  if (!notifyEnabled) {
    await chrome.storage.local.set({ streak: nextStreak });
    return;
  }
  if (nextStreak >= STREAK_THRESHOLD && !streakFired) {
    chrome.notifications.create(`streak-${Date.now()}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
      title: "OpenFeedling",
      message: `${nextStreak} minutes of shorts in a row. Cat says: please.`,
      priority: 1,
    });
    pushPhone().catch((e) => console.warn("[push-phone] failed:", e));
    nextFired = true;
  }
  if (nextStreak === 0) nextFired = false;
  await chrome.storage.local.set({ streak: nextStreak, streakFired: nextFired });
}

async function getYouTubeCookies() {
  const yt = await chrome.cookies.getAll({ domain: ".youtube.com" });
  const goog = await chrome.cookies.getAll({ domain: ".google.com" });
  const map = {};
  for (const c of goog) if (COOKIE_NAMES.has(c.name)) map[c.name] = c.value;
  for (const c of yt) if (COOKIE_NAMES.has(c.name)) map[c.name] = c.value;
  return map;
}

async function syncCookies() {
  const { serverUrl, secret } = await chrome.storage.local.get(["serverUrl", "secret"]);
  if (!serverUrl || !secret) {
    await chrome.storage.local.set({
      lastSync: Date.now(), lastSyncOk: false, lastSyncError: "not configured",
    });
    return { skipped: "not-configured" };
  }
  const cookies = await getYouTubeCookies();
  const count = Object.keys(cookies).length;
  if (!count) {
    await chrome.storage.local.set({
      lastSync: Date.now(), lastSyncOk: false, lastSyncError: "no youtube cookies in browser",
      lastSyncCount: 0,
    });
    return { skipped: "no-cookies" };
  }
  try {
    const r = await fetch(`${serverUrl}/api/cookies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${secret}` },
      body: JSON.stringify({ cookies, uploadedAt: Date.now() }),
    });
    const ok = r.ok;
    const errBody = ok ? "" : await r.text().catch(() => "");
    await chrome.storage.local.set({
      lastSync: Date.now(), lastSyncOk: ok, lastSyncStatus: r.status, lastSyncCount: count,
      lastSyncError: ok ? "" : `${r.status} ${errBody.slice(0, 100)}`,
    });
    return { ok, status: r.status, count };
  } catch (e) {
    await chrome.storage.local.set({
      lastSync: Date.now(), lastSyncOk: false, lastSyncError: String(e), lastSyncCount: count,
    });
    return { ok: false, error: String(e) };
  }
}
