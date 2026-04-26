import handler, { tick, setNextPollAt } from "./handler.ts";

const env = Deno.env.toObject();
const PORT = Number(env.PORT) || 3000;
const DATA_DIR = env.DATA_DIR || "./data";
const POLL_IDLE_MS = Number(env.POLL_IDLE_MS) || 5 * 60 * 1000;
const POLL_ACTIVE_MS = Number(env.POLL_ACTIVE_MS) || 60 * 1000;

async function loop() {
  let watching = false;
  try {
    const r = await tick();
    watching = r.watching;
  } catch (e) {
    console.error("[loop] tick error:", (e as Error).message);
  }
  const delay = watching ? POLL_ACTIVE_MS : POLL_IDLE_MS;
  setNextPollAt(Date.now() + delay);
  setTimeout(loop, delay);
}

setTimeout(loop, 3_000);

Deno.serve({ port: PORT, hostname: "0.0.0.0" }, (req) =>
  handler(req, { env, dataDir: DATA_DIR })
);
