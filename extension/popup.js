const $ = (id) => document.getElementById(id);

function fmtAge(ts) {
  if (!ts) return "never";
  const ago = Math.round((Date.now() - ts) / 1000);
  if (ago < 60) return `${ago}s ago`;
  if (ago < 3600) return `${Math.round(ago / 60)}min ago`;
  return `${Math.round(ago / 3600)}h ago`;
}

async function load() {
  const s = await chrome.storage.local.get([
    "serverUrl", "secret", "lastSync", "lastSyncOk",
    "lastSyncStatus", "lastSyncCount", "lastSyncError",
  ]);
  $("serverUrl").value = s.serverUrl || "";
  $("secret").value = s.secret || "";
  const status = $("status");
  if (!s.lastSync) {
    status.textContent = "not synced yet";
    return;
  }
  const age = fmtAge(s.lastSync);
  if (s.lastSyncOk) {
    status.innerHTML = `<span class="ok">✓ synced ${s.lastSyncCount} cookies (${age})</span>`;
  } else {
    status.innerHTML = `<span class="err">✗ ${age}: ${s.lastSyncError || "failed"}</span>`;
  }
}

async function syncNow() {
  $("status").textContent = "syncing...";
  const r = await chrome.runtime.sendMessage({ action: "sync-now" });
  if (r?.error) $("status").innerHTML = `<span class="err">${r.error}</span>`;
  setTimeout(load, 200);
}

$("save").onclick = async () => {
  const serverUrl = $("serverUrl").value.trim().replace(/\/$/, "");
  const secret = $("secret").value.trim();
  if (!serverUrl || !secret) {
    $("status").innerHTML = `<span class="err">fill both fields</span>`;
    return;
  }
  if (!/^https?:\/\//.test(serverUrl)) {
    $("status").innerHTML = `<span class="err">URL must start with http(s)://</span>`;
    return;
  }
  const granted = await chrome.permissions.request({ origins: [`${serverUrl}/*`] });
  if (!granted) {
    $("status").innerHTML = `<span class="err">permission denied</span>`;
    return;
  }
  await chrome.storage.local.set({ serverUrl, secret });
  await syncNow();
};

$("syncOnly").onclick = syncNow;

load();
