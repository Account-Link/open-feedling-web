import type { Snapshot, PetState } from "./state.ts";

export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: number;
}

const MAX_SNAPS = 24 * 60 / 5 + 10;
const SNAP_TTL_MS = 24 * 60 * 60 * 1000;
const PUSH_LOG_MAX = 500;

const snaps: Snapshot[] = [];
let lastState: PetState | null = null;
let lastPushedState: string | null = null;
const sessionMilestoneFired: Set<number> = new Set();
let sessionStartedAt: number | null = null;
let lastActivityAt: number | null = null;
let consecutiveActivePolls = 0;
let cumulativeActivePolls = 0;
let confirmedActivityFired = false;

let dataDir = "";
let subsFile = "";
let snapsFile = "";
let pushLogFile = "";
const subs: Map<string, PushSub> = new Map();

export interface PushLogEntry {
  at: number;
  trigger: string;
  body: string;
  sent: number;
  pruned: number;
  endpoints: { host: string; ok: boolean; status?: number; error?: string }[];
}
const pushLog: PushLogEntry[] = [];

export async function initStore(dir: string): Promise<void> {
  dataDir = dir;
  if (!dataDir) return;
  await Deno.mkdir(dataDir, { recursive: true });
  subsFile = `${dataDir}/subs.json`;
  snapsFile = `${dataDir}/snaps.json`;
  pushLogFile = `${dataDir}/pushes.json`;
  try {
    const arr = JSON.parse(await Deno.readTextFile(subsFile)) as PushSub[];
    for (const s of arr) subs.set(s.endpoint, s);
    console.log(`[store] loaded ${subs.size} subs`);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) console.error("[store] subs:", (e as Error).message);
  }
  try {
    const arr = JSON.parse(await Deno.readTextFile(snapsFile)) as Snapshot[];
    const cutoff = Date.now() - SNAP_TTL_MS;
    for (const s of arr) if (s.at >= cutoff) snaps.push(s);
    console.log(`[store] loaded ${snaps.length} snaps (24h window)`);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) console.error("[store] snaps:", (e as Error).message);
  }
  try {
    pushLog.push(...(JSON.parse(await Deno.readTextFile(pushLogFile)) as PushLogEntry[]));
    console.log(`[store] loaded ${pushLog.length} push log entries`);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) console.error("[store] pushlog:", (e as Error).message);
  }
}

async function persistSnaps() {
  if (snapsFile) await Deno.writeTextFile(snapsFile, JSON.stringify(snaps));
}
async function persistPushLog() {
  if (pushLogFile) await Deno.writeTextFile(pushLogFile, JSON.stringify(pushLog));
}
async function persistSubs() {
  if (subsFile) await Deno.writeTextFile(subsFile, JSON.stringify(Array.from(subs.values()), null, 2));
}

export async function addSnapshot(s: Snapshot): Promise<void> {
  snaps.push(s);
  const cutoff = Date.now() - SNAP_TTL_MS;
  while (snaps.length && snaps[0].at < cutoff) snaps.shift();
  if (snaps.length > MAX_SNAPS) snaps.splice(0, snaps.length - MAX_SNAPS);
  await persistSnaps();
}

export async function recordPush(entry: PushLogEntry): Promise<void> {
  pushLog.push(entry);
  if (pushLog.length > PUSH_LOG_MAX) pushLog.splice(0, pushLog.length - PUSH_LOG_MAX);
  await persistPushLog();
}

export function getPushLog(limit?: number): PushLogEntry[] {
  if (!limit || limit >= pushLog.length) return pushLog.slice();
  return pushLog.slice(-limit);
}

export function recentSnapshots(): Snapshot[] { return snaps.slice(); }
export function setState(s: PetState) { lastState = s; }
export function getState(): PetState | null { return lastState; }
export function markPushed(code: string) { lastPushedState = code; }
export function lastPushed(): string | null { return lastPushedState; }

const SESSION_GAP_MS = 15 * 60 * 1000;

export interface SessionUpdate {
  newSession: boolean;
  sessionMin: number;
  startedAt: number | null;
}

export function updateSession(hasActivity: boolean, now = Date.now()): SessionUpdate {
  if (hasActivity) {
    let newSession = false;
    if (sessionStartedAt === null || (lastActivityAt !== null && now - lastActivityAt > SESSION_GAP_MS)) {
      sessionStartedAt = now;
      sessionMilestoneFired.clear();
      consecutiveActivePolls = 0;
      cumulativeActivePolls = 0;
      confirmedActivityFired = false;
      newSession = true;
    }
    cumulativeActivePolls += 1;
    lastActivityAt = now;
    return { newSession, sessionMin: Math.round((now - sessionStartedAt) / 60_000), startedAt: sessionStartedAt };
  }
  if (sessionStartedAt !== null && lastActivityAt !== null && now - lastActivityAt > SESSION_GAP_MS) {
    sessionStartedAt = null;
  }
  return {
    newSession: false,
    sessionMin: sessionStartedAt ? Math.round((now - sessionStartedAt) / 60_000) : 0,
    startedAt: sessionStartedAt,
  };
}

export function checkConfirmedActivity(isActive: boolean, threshold = 4): boolean {
  if (isActive) consecutiveActivePolls += 1;
  else consecutiveActivePolls = 0;
  if (consecutiveActivePolls >= threshold && !confirmedActivityFired) {
    confirmedActivityFired = true;
    return true;
  }
  return false;
}

export function consecutivePolls(): number { return consecutiveActivePolls; }
export function cumulativePolls(): number { return cumulativeActivePolls; }

export function pendingSessionMilestone(activePolls: number, milestones: number[]): number | null {
  let crossed: number | null = null;
  for (const m of milestones) {
    if (activePolls >= m && !sessionMilestoneFired.has(m)) {
      crossed = m;
      sessionMilestoneFired.add(m);
    }
  }
  return crossed;
}

export function getSession(): { startedAt: number | null; lastActivityAt: number | null } {
  return { startedAt: sessionStartedAt, lastActivityAt };
}

export async function addSub(s: Omit<PushSub, "createdAt">): Promise<void> {
  subs.set(s.endpoint, { ...s, createdAt: Date.now() });
  await persistSubs();
}

export async function removeSub(endpoint: string): Promise<void> {
  if (subs.delete(endpoint)) await persistSubs();
}

export function allSubs(): PushSub[] { return Array.from(subs.values()); }
