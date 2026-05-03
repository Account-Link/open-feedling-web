export async function fetchHistory() {
  const r = await fetch("https://www.youtube.com/feed/history", { credentials: "include" });
  if (!r.ok) throw new Error(`youtube ${r.status}`);
  const html = await r.text();
  const m = html.match(/var ytInitialData\s*=\s*(\{[\s\S]+?\});\s*<\/script>/);
  if (!m) throw new Error("ytInitialData not found");
  const data = JSON.parse(m[1]);
  const tracking = data?.responseContext?.serviceTrackingParams ?? [];
  const loggedIn = tracking.some((p) => p.params?.some((pp) => pp.key === "logged_in" && pp.value === "1"));
  return { data, loggedIn };
}

export function parseHistory(data) {
  const sections = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]
    ?.tabRenderer?.content?.sectionListRenderer?.contents ?? [];
  return sections.map((section) => {
    const items = section?.itemSectionRenderer?.contents ?? [];
    const h = section?.itemSectionRenderer?.header?.itemSectionHeaderRenderer?.title;
    const title = h?.runs?.[0]?.text ?? h?.simpleText ?? "";
    const shorts = [];
    for (const item of items) {
      if (item.reelShelfRenderer) {
        for (const reel of item.reelShelfRenderer.items ?? []) {
          const slv = reel.shortsLockupViewModel;
          if (!slv) continue;
          shorts.push({
            id: slv.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId ?? "",
            title: slv.overlayMetadata?.primaryText?.content ?? "",
          });
        }
      } else if (item.videoRenderer && (item.videoRenderer.thumbnailOverlays ?? [])
          .some((o) => o.thumbnailOverlayTimeStatusRenderer?.style === "SHORTS")) {
        shorts.push({
          id: item.videoRenderer.videoId ?? "",
          title: item.videoRenderer.title?.runs?.[0]?.text ?? "",
        });
      }
    }
    return { title, shorts };
  }).filter((s) => s.shorts.length);
}

export function snapshotFromSections(sections) {
  const today = sections.find((s) => s.title === "Today")?.shorts ?? [];
  const allShorts = sections.flatMap((s) => s.shorts);
  return {
    at: Date.now(),
    sections,
    todayCount: today.length,
    totalCount: allShorts.length,
    allIds: allShorts.map((s) => s.id).filter(Boolean),
  };
}

// Returns count of shorts in `current` whose id isn't in `prevIds`.
export function newShortsCount(current, prevIds) {
  const prev = new Set(prevIds);
  return current.filter((id) => id && !prev.has(id)).length;
}

// ============================================================================
// VAPID + Web Push (for paired phone)
// ============================================================================

function bufToB64Url(buf) {
  let s = "";
  const v = new Uint8Array(buf);
  for (let i = 0; i < v.length; i++) s += String.fromCharCode(v[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function strToB64Url(s) {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function getOrCreateVapidKeypair() {
  const stored = await chrome.storage.local.get(["vapidPrivateJwk", "vapidPublicB64"]);
  if (stored.vapidPrivateJwk && stored.vapidPublicB64) {
    return { privateJwk: stored.vapidPrivateJwk, publicB64: stored.vapidPublicB64 };
  }
  const kp = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"],
  );
  const privateJwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const pubRaw = await crypto.subtle.exportKey("raw", kp.publicKey);
  const publicB64 = bufToB64Url(pubRaw);
  await chrome.storage.local.set({ vapidPrivateJwk: privateJwk, vapidPublicB64: publicB64 });
  return { privateJwk, publicB64 };
}

async function vapidJwt(privateJwk, audience, sub) {
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: sub || "mailto:openfeedling@example.com",
  };
  const headerB64 = strToB64Url(JSON.stringify(header));
  const payloadB64 = strToB64Url(JSON.stringify(payload));
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const key = await crypto.subtle.importKey(
    "jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, data);
  return `${headerB64}.${payloadB64}.${bufToB64Url(sig)}`;
}

// Sends an empty (no-payload) web push to the subscription. Phone SW shows a
// hardcoded notification. Future: encrypt payloads (RFC 8291) for per-trigger
// messages — needs HKDF + AES-128-GCM, deferred for v0.
export async function sendWebPush(subscription, vapid, ttl = 60) {
  const audience = new URL(subscription.endpoint).origin;
  const jwt = await vapidJwt(vapid.privateJwk, audience);
  let r;
  try {
    r = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Authorization": `vapid t=${jwt}, k=${vapid.publicB64}`,
        "TTL": String(ttl),
      },
    });
  } catch (e) {
    return { ok: false, error: `fetch failed: ${e.message || e} (host_permission missing for ${audience}?)` };
  }
  if (r.ok) return { ok: true, status: r.status };
  const body = await r.text().catch(() => "");
  return { ok: false, status: r.status, error: `push service ${r.status}: ${body.slice(0, 200) || r.statusText}` };
}

// Polls an ntfy topic once. Returns parsed JSON body (the subscription
// blob the phone POSTed) or null if no message yet.
export async function pollNtfyOnce(topic) {
  const r = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}/json?poll=1`);
  if (!r.ok) return null;
  const text = await r.text();
  if (!text.trim()) return null;
  // ntfy /json returns one JSON object per line (newline-delimited)
  const lines = text.trim().split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      const ev = JSON.parse(line);
      if (ev.event !== "message" || !ev.message) continue;
      const sub = JSON.parse(ev.message);
      if (sub?.endpoint && sub?.keys?.p256dh && sub?.keys?.auth) return sub;
    } catch { /* skip malformed */ }
  }
  return null;
}

export function newPairTopic() {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  const hex = Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `feedling-${hex}`;
}

export const PAIR_PAGE_BASE = "https://teleport-computer.github.io/open-feedling-web/pair/";

