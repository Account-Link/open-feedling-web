let dataDir = "";
let cookiesFile = "";
let current: Record<string, string> = {};
let updatedAt = 0;

export async function initCookies(dir: string): Promise<void> {
  dataDir = dir;
  if (!dataDir) return;
  cookiesFile = `${dataDir}/cookies.json`;
  try {
    const obj = JSON.parse(await Deno.readTextFile(cookiesFile));
    current = obj.cookies ?? {};
    updatedAt = obj.updatedAt ?? 0;
    const ageMin = Math.round((Date.now() - updatedAt) / 60_000);
    console.log(`[cookies] loaded ${Object.keys(current).length} cookies (${ageMin}min old)`);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) console.error("[cookies] load:", (e as Error).message);
  }
}

export async function setCookies(cookies: Record<string, string>): Promise<void> {
  current = cookies;
  updatedAt = Date.now();
  if (cookiesFile) await Deno.writeTextFile(cookiesFile, JSON.stringify({ cookies, updatedAt }));
}

export function getCookies(): Record<string, string> { return current; }
export function cookieAgeMs(): number { return updatedAt ? Date.now() - updatedAt : Infinity; }
export function cookieUpdatedAt(): number { return updatedAt; }
export function hasCookies(): boolean {
  return !!(current["SAPISID"] || current["__Secure-3PAPISID"]);
}
