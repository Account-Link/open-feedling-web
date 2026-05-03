import {
  fetchHistory, parseHistory, snapshotFromSections,
  getOrCreateVapidKeypair, pollNtfyOnce, newPairTopic, PAIR_PAGE_BASE,
} from "./lib.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

function fmtAge(ts) {
  if (!ts) return "never";
  const ago = Math.round((Date.now() - ts) / 1000);
  if (ago < 60) return `${ago}s ago`;
  if (ago < 3600) return `${Math.round(ago / 60)}min ago`;
  return `${Math.round(ago / 3600)}h ago`;
}

function render(snap) {
  $("subline").textContent = `last fetched ${fmtAge(snap.at)}`;
  $("todayCount").textContent = snap.todayCount;
  $("totalCount").textContent = snap.totalCount;
  $("history").className = "";
  $("history").innerHTML = snap.sections.map((s) =>
    `<div class="section">${esc(s.title)} · ${s.shorts.length}</div>` +
    s.shorts.map((sh) => `<div class="item">${esc(sh.title)}</div>`).join("")
  ).join("");
}

async function refresh() {
  $("subline").textContent = "fetching from youtube...";
  try {
    const { data, loggedIn } = await fetchHistory();
    if (!loggedIn) {
      $("subline").textContent = "not signed in to YouTube";
      $("history").className = "err";
      $("history").textContent = "sign in to YouTube and click refresh";
      return;
    }
    const sections = parseHistory(data);
    const snap = snapshotFromSections(sections);
    await chrome.storage.local.set({ lastSnapshot: snap });
    render(snap);
  } catch (e) {
    $("subline").textContent = "error";
    $("history").className = "err";
    $("history").textContent = e.message;
  }
}

$("refresh").onclick = refresh;
$("testNotify").onclick = async () => {
  const r = await chrome.runtime.sendMessage({ action: "test-notification" });
  if (r?.error) alert("notification failed: " + r.error);
};

// === Share-to-phone ===

let pollAbort = null;

function setPhoneStatus(text, kind) {
  const el = $("phoneStatus");
  el.textContent = text;
  el.className = "phone-status" + (kind ? " " + kind : "");
}

function renderQRBody(topic, pairUrl) {
  const qr = window.qrcode(0, "M");
  qr.addData(pairUrl);
  qr.make();
  const dataUrl = qr.createDataURL(6, 4);
  $("phoneBody").innerHTML = `
    <div class="qr-wrap"><img src="${dataUrl}" alt="QR code"></div>
    <div class="qr-link">${esc(pairUrl)}</div>
    <div class="phone-actions">
      <button class="ghost" id="copyLink">Copy link</button>
      <button class="ghost" id="cancelPair">Cancel</button>
    </div>`;
  $("copyLink").onclick = async () => {
    await navigator.clipboard.writeText(pairUrl);
    setPhoneStatus("✓ link copied", "ok");
  };
  $("cancelPair").onclick = forgetPhone;
}

function renderPaired(sub) {
  const host = (() => { try { return new URL(sub.endpoint).host; } catch { return "(?)"; } })();
  $("phoneBody").innerHTML = `
    <div style="font-size:0.85rem;margin-bottom:6px">Push endpoint: <code style="font-size:0.7rem">${esc(host)}</code></div>
    <div class="phone-actions">
      <button id="testPhone">Send test push</button>
      <button class="ghost" id="forgetPhone">Forget phone</button>
    </div>`;
  $("testPhone").onclick = async () => {
    setPhoneStatus("sending…");
    const r = await chrome.runtime.sendMessage({ action: "test-phone-push" });
    if (r?.ok) setPhoneStatus(`✓ sent (push service ${r.status})`, "ok");
    else setPhoneStatus(`✗ ${r?.error || "failed"}`, "err");
  };
  $("forgetPhone").onclick = forgetPhone;
}

function renderUnpaired() {
  $("phoneBody").innerHTML = `<div class="phone-actions"><button id="startPair">Generate QR</button></div>`;
  $("startPair").onclick = startPairing;
}

async function startPairing() {
  setPhoneStatus("preparing…");
  const vapid = await getOrCreateVapidKeypair();
  let { pairTopic } = await chrome.storage.local.get(["pairTopic"]);
  if (!pairTopic) {
    pairTopic = newPairTopic();
    await chrome.storage.local.set({ pairTopic });
  }
  const pairUrl = `${PAIR_PAGE_BASE}?topic=${encodeURIComponent(pairTopic)}&pk=${encodeURIComponent(vapid.publicB64)}`;
  renderQRBody(pairTopic, pairUrl);
  setPhoneStatus("waiting for phone — scan the QR with your phone camera");
  await pollLoop(pairTopic);
}

async function pollLoop(topic) {
  pollAbort = { canceled: false };
  const me = pollAbort;
  const start = Date.now();
  while (!me.canceled && Date.now() - start < 5 * 60_000) {
    try {
      const sub = await pollNtfyOnce(topic);
      if (sub) {
        await chrome.storage.local.set({ phoneSub: sub });
        await chrome.storage.local.remove(["pairTopic"]);
        if (!me.canceled) {
          setPhoneStatus("✓ phone subscribed", "ok");
          renderPaired(sub);
        }
        return;
      }
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  if (!me.canceled) setPhoneStatus("timed out waiting for phone — try again", "err");
}

async function forgetPhone() {
  if (pollAbort) pollAbort.canceled = true;
  await chrome.storage.local.remove(["phoneSub", "pairTopic"]);
  setPhoneStatus("not paired");
  renderUnpaired();
}

async function loadPhone() {
  const { phoneSub, pairTopic } = await chrome.storage.local.get(["phoneSub", "pairTopic"]);
  if (phoneSub) {
    setPhoneStatus("✓ phone subscribed", "ok");
    renderPaired(phoneSub);
  } else if (pairTopic) {
    // Resume in-flight pairing
    const vapid = await getOrCreateVapidKeypair();
    const pairUrl = `${PAIR_PAGE_BASE}?topic=${encodeURIComponent(pairTopic)}&pk=${encodeURIComponent(vapid.publicB64)}`;
    renderQRBody(pairTopic, pairUrl);
    setPhoneStatus("resuming — waiting for phone");
    pollLoop(pairTopic);
  } else if (location.hash === "#pair") {
    // Deep link from popup's "Pair phone" button — skip the unpaired state, go straight to QR
    startPairing();
  } else {
    setPhoneStatus("not paired");
    renderUnpaired();
  }
}

async function loadAdvanced() {
  const { openrouterKey } = await chrome.storage.local.get(["openrouterKey"]);
  $("openrouterKey").value = openrouterKey || "";
}

$("saveAdvanced")?.addEventListener("click", async () => {
  const key = $("openrouterKey").value.trim();
  await chrome.storage.local.set({ openrouterKey: key });
  $("advancedStatus").textContent = key ? "✓ saved (no effect yet — feature in flight)" : "cleared";
  $("advancedStatus").style.color = "#2a8";
});

(async () => {
  const { lastSnapshot } = await chrome.storage.local.get(["lastSnapshot"]);
  if (lastSnapshot) render(lastSnapshot);
  loadPhone();
  loadAdvanced();
  refresh();
})();
