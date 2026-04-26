// Cookie sync loop. Mirrors the proven pattern from the OAuth3 yt-shorts-v3 extension:
// alarm every 30min + cookies.onChanged (debounced 500ms) → POST to user's server.
// See: https://github.com/.../oauth3 — adapted to point at a self-hosted endpoint.

const SYNC_ALARM = "openfeedling-sync";
const COOKIE_NAMES = new Set([
  "SID", "HSID", "SSID", "APISID", "SAPISID",
  "__Secure-1PSID", "__Secure-3PSID",
  "__Secure-1PAPISID", "__Secure-3PAPISID",
  "LOGIN_INFO", "PREF", "SIDCC",
  "__Secure-1PSIDCC", "__Secure-3PSIDCC",
  "__Secure-1PSIDTS", "__Secure-3PSIDTS",
]);

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 30 });
});

chrome.alarms.onAlarm.addListener((a) => { if (a.name === SYNC_ALARM) syncCookies(); });

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
});

async function getYouTubeCookies() {
  const yt = await chrome.cookies.getAll({ domain: ".youtube.com" });
  const goog = await chrome.cookies.getAll({ domain: ".google.com" });
  const map = {};
  // Prefer .youtube.com value on conflict.
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
      lastSync: Date.now(),
      lastSyncOk: ok,
      lastSyncStatus: r.status,
      lastSyncCount: count,
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
