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

(async () => {
  const { lastSnapshot } = await chrome.storage.local.get(["lastSnapshot"]);
  if (lastSnapshot) render(lastSnapshot);
  refresh();
})();
