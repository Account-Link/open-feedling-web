import { shortCheck } from "./youtube.ts";
import { computeState, snapshotFrom, pushCopy } from "./state.ts";
import {
  addSnapshot, recentSnapshots, setState, getState,
  addSub, removeSub, allSubs, lastPushed, markPushed,
  updateSession, pendingSessionMilestone, getSession, initStore,
  recordPush, getPushLog, checkConfirmedActivity, consecutivePolls, cumulativePolls,
} from "./store.ts";
import { configurePush, pushAll, vapidPublicKey } from "./push.ts";
import { renderDiary } from "./diary.ts";
import {
  initCookies, setCookies, getCookies, hasCookies, cookieAgeMs, cookieUpdatedAt,
} from "./cookies.ts";

let ready = false;
let extSecret = "";
let openrouterKey = "";
let diaryModel = "anthropic/claude-sonnet-4-5";
let pollIdleMs = 5 * 60 * 1000;
let pollActiveMs = 60 * 1000;
const SESSION_MILESTONES = [30, 60, 90, 120];
let nextPollAt = 0;
let lastPollAt = 0;
let lastPollOk = false;
let lastPollError = "";

export interface HandlerCtx {
  env: Record<string, string>;
  dataDir?: string;
}

function milestoneCopy(activeMin: number, e: number): string {
  if (activeMin <= 30) return `${activeMin} min of confirmed scrolling. Cat is mildly concerned.`;
  if (activeMin <= 60) return `An hour of confirmed scrolling, energy ${e}. Maybe a stretch?`;
  if (activeMin <= 90) return `${activeMin} confirmed minutes — break time.`;
  return `${activeMin} min of confirmed shorts. Cat says: please.`;
}

export async function tick(): Promise<{ watching: boolean; skipped?: string }> {
  lastPollAt = Date.now();
  if (!hasCookies()) {
    lastPollOk = false;
    lastPollError = "no cookies — extension hasn't synced";
    return { watching: false, skipped: "no-cookies" };
  }
  let r;
  try {
    r = await shortCheck(getCookies());
  } catch (e) {
    lastPollOk = false;
    lastPollError = (e as Error).message;
    console.error("[tick] shortCheck failed:", lastPollError);
    return { watching: false, skipped: "youtube-error" };
  }
  lastPollOk = true;
  lastPollError = "";

  const snap = snapshotFrom(r);
  (snap as any).shorts = r.shorts || [];

  const prevSnaps = recentSnapshots();
  const prevSnap = prevSnaps.length ? prevSnaps[prevSnaps.length - 1] : null;
  const countDelta = prevSnap ? snap.shortsCount - prevSnap.shortsCount : 0;
  const hasActivity = countDelta > 0;
  snap.watching = hasActivity;
  snap.newShorts = Math.max(0, countDelta);

  await addSnapshot(snap);

  const prev = getState();
  const state = computeState(recentSnapshots(), prev?.energy ?? 0);
  setState(state);
  updateSession(hasActivity);

  console.log(
    `[tick] count=${snap.shortsCount} delta=${countDelta} active=${hasActivity} ` +
    `cumulative=${cumulativePolls()} state=${state.stateCode} energy=${state.energy}`,
  );

  const triggers: string[] = [];
  if (checkConfirmedActivity(hasActivity, 5)) triggers.push("confirmed_5");
  const m = pendingSessionMilestone(cumulativePolls(), SESSION_MILESTONES);
  if (m !== null) triggers.push(`session_${m}`);
  if (
    state.stateCode !== lastPushed() &&
    (state.stateCode === "drained" || state.stateCode === "night_owl")
  ) {
    triggers.push(state.stateCode);
    markPushed(state.stateCode);
  }

  for (const t of triggers) {
    let body: string;
    if (t === "confirmed_5") body = "5 minutes of solid scrolling. Cat noticed.";
    else if (t.startsWith("session_")) body = milestoneCopy(Number(t.slice("session_".length)), state.energy);
    else body = pushCopy[state.stateCode];
    try {
      const rep = await pushAll("feedling", body, "");
      console.log(`[push] trigger=${t} sent=${rep.sent} pruned=${rep.pruned}`);
      await recordPush({
        at: Date.now(), trigger: t, body, sent: rep.sent, pruned: rep.pruned,
        endpoints: rep.details.map((d) => ({
          host: (() => { try { return new URL(d.endpoint.replace("...", "")).host; } catch { return d.endpoint.slice(0, 40); } })(),
          ok: d.ok, status: d.status, error: d.error,
        })),
      });
    } catch (e) {
      console.error("[push] trigger", t, "failed:", (e as Error).message);
      await recordPush({
        at: Date.now(), trigger: t, body, sent: 0, pruned: 0,
        endpoints: [{ host: "(error)", ok: false, error: (e as Error).message }],
      });
    }
  }
  return { watching: hasActivity };
}

export function getPollSchedule() {
  return { nextPollAt, lastPollAt, lastPollOk, lastPollError, pollIdleMs, pollActiveMs };
}
export function setNextPollAt(t: number) { nextPollAt = t; }

async function init(env: Record<string, string>, dataDir: string) {
  if (ready) return;
  await initStore(dataDir);
  await initCookies(dataDir);

  extSecret = env.EXT_SHARED_SECRET || "";
  if (!extSecret) console.warn("[init] EXT_SHARED_SECRET missing — /api/cookies will reject all uploads");

  openrouterKey = env.OPENROUTER_API_KEY || "";
  diaryModel = env.DIARY_MODEL || diaryModel;
  pollIdleMs = Number(env.POLL_IDLE_MS) || pollIdleMs;
  pollActiveMs = Number(env.POLL_ACTIVE_MS) || pollActiveMs;

  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    configurePush({
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
      subject: env.VAPID_SUBJECT || "mailto:you@example.com",
    });
    console.log("[init] push configured");
  } else {
    console.warn("[init] VAPID keys missing — push disabled");
  }
  ready = true;
  console.log(`[init] ready — idle=${pollIdleMs}ms active=${pollActiveMs}ms data=${dataDir || "(memory)"}`);
}

async function readStatic(path: string): Promise<Uint8Array | null> {
  try { return await Deno.readFile(new URL(`./public${path}`, import.meta.url)); }
  catch { return null; }
}

function json(obj: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(obj), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

const EXT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export default async function handler(req: Request, ctx: HandlerCtx): Promise<Response> {
  await init(ctx.env || {}, ctx.dataDir || "");

  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (path === "/_warmup") return new Response("ok");

  if (req.method === "GET" && path === "/api/health") {
    return json({
      ready,
      cookies: { present: hasCookies(), updatedAt: cookieUpdatedAt(), ageMs: cookieAgeMs() },
      poll: getPollSchedule(),
      pushConfigured: !!(ctx.env?.VAPID_PUBLIC_KEY),
    });
  }

  if (req.method === "POST" && path === "/api/cookies") {
    const auth = req.headers.get("Authorization") || "";
    if (!extSecret || auth !== `Bearer ${extSecret}`) {
      return json({ error: "unauthorized" }, { status: 401, headers: corsHeaders() });
    }
    const body = await req.json().catch(() => null) as any;
    if (!body?.cookies || typeof body.cookies !== "object") {
      return json({ error: "missing cookies" }, { status: 400, headers: corsHeaders() });
    }
    await setCookies(body.cookies);
    console.log(`[cookies] received ${Object.keys(body.cookies).length} cookies from extension`);
    return json({ ok: true, count: Object.keys(body.cookies).length }, { headers: corsHeaders() });
  }

  if (req.method === "GET" && path === "/api/state") {
    const sess = getSession();
    const sessionMin = sess.startedAt ? Math.round((Date.now() - sess.startedAt) / 60_000) : 0;
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Math.max(1, Math.min(500, Number(limitParam) | 0)) : 12;
    return json({
      state: getState(),
      snaps: recentSnapshots().slice(-limit),
      session: {
        startedAt: sess.startedAt,
        lastActivityAt: sess.lastActivityAt,
        minutes: sessionMin,
        consecutiveActivePolls: consecutivePolls(),
        cumulativeActivePolls: cumulativePolls(),
      },
      cookies: { present: hasCookies(), updatedAt: cookieUpdatedAt(), ageMs: cookieAgeMs() },
      poll: getPollSchedule(),
    });
  }

  if (req.method === "GET" && path === "/api/diary") {
    const s = getState();
    if (!s) return json({ diary: "" });
    try {
      const diary = await renderDiary(
        s, recentSnapshots(), openrouterKey, diaryModel,
        url.searchParams.get("force") === "1",
      );
      return json({ diary });
    } catch (e) {
      return json({ error: (e as Error).message }, { status: 500 });
    }
  }

  if (req.method === "GET" && path === "/api/pushes") {
    const limit = url.searchParams.get("limit");
    return json({ pushes: getPushLog(limit ? Number(limit) | 0 : undefined) });
  }

  if (req.method === "GET" && path === "/api/subs") {
    return json({
      subs: allSubs().map((s) => ({
        host: new URL(s.endpoint).host,
        fingerprint: s.endpoint.split("/").slice(-1)[0].slice(0, 12),
        endpoint: s.endpoint,
        createdAt: s.createdAt,
      })),
    });
  }

  if (req.method === "POST" && path === "/api/unsubscribe") {
    const body = await req.json().catch(() => null) as any;
    if (!body?.endpoint) return json({ error: "missing endpoint" }, { status: 400 });
    await removeSub(body.endpoint);
    return json({ ok: true });
  }

  if (req.method === "GET" && path === "/api/vapid-key") {
    try { return json({ key: vapidPublicKey() }); }
    catch (e) { return json({ error: (e as Error).message }, { status: 503 }); }
  }

  if (req.method === "POST" && path === "/api/subscribe") {
    const body = await req.json().catch(() => null) as any;
    if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
      return json({ error: "bad subscription" }, { status: 400 });
    }
    await addSub({ endpoint: body.endpoint, keys: body.keys });
    return json({ ok: true });
  }

  if (req.method === "POST" && path === "/api/poll-now") {
    try {
      const r = await tick();
      return json({ ok: true, ...r });
    } catch (e) {
      return json({ error: (e as Error).message }, { status: 500 });
    }
  }

  if (req.method === "POST" && path === "/api/test-push") {
    const body = "hello from the server 🐈";
    try {
      const r = await pushAll("feedling test", body, "");
      await recordPush({
        at: Date.now(), trigger: "test", body, sent: r.sent, pruned: r.pruned,
        endpoints: r.details.map((d) => ({
          host: (() => { try { return new URL(d.endpoint.replace("...", "")).host; } catch { return d.endpoint.slice(0, 40); } })(),
          ok: d.ok, status: d.status, error: d.error,
        })),
      });
      return json(r);
    } catch (e) {
      return json({ error: (e as Error).message }, { status: 500 });
    }
  }

  if (req.method === "GET") {
    const file = path === "/" || path === "" ? "/index.html" : path;
    const data = await readStatic(file);
    if (!data) return new Response("not found", { status: 404 });
    const ext = file.slice(file.lastIndexOf("."));
    return new Response(data as BodyInit, {
      headers: { "Content-Type": EXT_TYPES[ext] || "application/octet-stream" },
    });
  }
  return new Response("method not allowed", { status: 405 });
}
