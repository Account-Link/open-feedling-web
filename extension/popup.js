import { fetchHistory, parseHistory, snapshotFromSections } from "./lib.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

function fmtAge(ts) {
  if (!ts) return "never";
  const ago = Math.round((Date.now() - ts) / 1000);
  if (ago < 60) return `${ago}s ago`;
  if (ago < 3600) return `${Math.round(ago / 60)}min ago`;
  return `${Math.round(ago / 3600)}h ago`;
}

function setPill({ snap, error, refreshing }) {
  const pill = $("pill");
  pill.classList.remove("err");
  if (error && !snap) {
    pill.classList.add("err");
    pill.textContent = error;
    return;
  }
  if (snap) {
    const tail = refreshing
      ? `<span class="age">refreshing…</span>`
      : `<span class="age">last fetched ${fmtAge(snap.at)}${error ? ` · ${esc(error)}` : ""}</span>`;
    pill.innerHTML = `<b>${snap.todayCount}</b> shorts today · <b>${snap.totalCount}</b> in history${tail}`;
    return;
  }
  pill.innerHTML = `loading watch history…<span class="age">~1 sec</span>`;
}

async function fetchAndStore() {
  const { data, loggedIn } = await fetchHistory();
  if (!loggedIn) throw new Error("not signed in to YouTube — sign in at youtube.com and reopen");
  const sections = parseHistory(data);
  const snap = snapshotFromSections(sections);
  await chrome.storage.local.set({ lastSnapshot: snap, lastSnapshotError: "" });
  return snap;
}

async function loadConfig() {
  const s = await chrome.storage.local.get([
    "serverUrl", "secret", "lastSync", "lastSyncOk", "lastSyncCount", "lastSyncError",
  ]);
  $("serverUrl").value = s.serverUrl || "";
  $("secret").value = s.secret || "";
  const st = $("syncStatus");
  if (!s.serverUrl) st.textContent = "no server configured (local-only mode)";
  else if (!s.lastSync) st.textContent = "configured but not synced yet";
  else if (s.lastSyncOk) st.innerHTML = `<span class="ok">✓ synced ${s.lastSyncCount} cookies (${fmtAge(s.lastSync)})</span>`;
  else st.innerHTML = `<span class="bad">✗ ${fmtAge(s.lastSync)}: ${esc(s.lastSyncError || "failed")}</span>`;
}

$("dash").onclick = () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  window.close();
};

$("pairPhone").onclick = () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html#pair") });
  window.close();
};

$("notify").onchange = async (e) => {
  const enabled = e.target.checked;
  await chrome.storage.local.set({ notifyEnabled: enabled });
  $("confirm").textContent = enabled
    ? "✓ on — keep scrolling, you'll get a popup"
    : "off";
};

$("gear").onclick = () => {
  const c = $("config");
  c.classList.toggle("open");
  if (c.classList.contains("open")) loadConfig();
};

$("save").onclick = async () => {
  const serverUrl = $("serverUrl").value.trim().replace(/\/$/, "");
  const secret = $("secret").value.trim();
  if (!serverUrl) {
    await chrome.storage.local.set({ serverUrl: "", secret: "" });
    $("syncStatus").textContent = "cleared — local-only mode";
    return;
  }
  if (!/^https?:\/\//.test(serverUrl)) {
    $("syncStatus").innerHTML = `<span class="bad">URL must start with http(s)://</span>`;
    return;
  }
  const granted = await chrome.permissions.request({ origins: [`${serverUrl}/*`] });
  if (!granted) {
    $("syncStatus").innerHTML = `<span class="bad">permission denied</span>`;
    return;
  }
  await chrome.storage.local.set({ serverUrl, secret });
  $("syncStatus").textContent = "syncing...";
  await chrome.runtime.sendMessage({ action: "sync-now" });
  setTimeout(loadConfig, 200);
};

(async () => {
  const { notifyEnabled, lastSnapshot, phoneSub } = await chrome.storage.local.get(["notifyEnabled", "lastSnapshot", "phoneSub"]);
  $("notify").checked = !!notifyEnabled;
  if (phoneSub) {
    $("pairPhone").textContent = "📱 Phone paired — re-pair";
    $("pairedNote").textContent = "✓ a phone is paired";
  }
  setPill({ snap: lastSnapshot || null, refreshing: !lastSnapshot || Date.now() - lastSnapshot.at > 30_000 });
  if (!lastSnapshot || Date.now() - lastSnapshot.at > 30_000) {
    try {
      const snap = await fetchAndStore();
      setPill({ snap });
    } catch (e) {
      const cached = (await chrome.storage.local.get(["lastSnapshot"])).lastSnapshot;
      setPill({ snap: cached || null, error: e.message });
    }
  }
})();
