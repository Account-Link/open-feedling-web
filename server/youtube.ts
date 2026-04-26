// Direct YouTube InnerTube client. Uses the SAPISIDHASH auth scheme that the YouTube web
// app itself uses for /youtubei/v1/* — derived from oauth3/yt-testing/test_tee_yt.sh.
// The shorts/non-shorts parser is lifted from the yt-shorts-v3 capability code in
// oauth3/yt-testing/setup_short_check.sh.

export interface ShortCheckResult {
  watching: boolean;
  newShorts: number;
  shortsCount: number;
  videosToday: number;
  shorts: { id: string; title: string }[];
  checked: string;
  elapsed: string;
}

const CLIENT_VERSION = "2.20250101.00.00";

async function sapisidHash(sapisid: string): Promise<string> {
  const ts = Math.floor(Date.now() / 1000);
  const buf = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(`${ts} ${sapisid} https://www.youtube.com`),
  );
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return `SAPISIDHASH ${ts}_${hex}`;
}

function parseHistory(data: any): { shorts: { id: string; title: string }[]; videos: number } {
  const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs ?? [];
  const sections = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents ?? [];
  const shorts: { id: string; title: string }[] = [];
  let videos = 0;
  for (const section of sections) {
    const items = section?.itemSectionRenderer?.contents ?? [];
    for (const item of items) {
      const v = item.videoRenderer, lv = item.lockupViewModel;
      if (!v && !lv) continue;
      const overlay = v?.thumbnailOverlays ?? [];
      const isShort =
        overlay.some((o: any) => o.thumbnailOverlayTimeStatusRenderer?.style === "SHORTS") ||
        !!lv?.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel
          ?.metadataRows?.some((r: any) =>
            r.metadataParts?.some((p: any) => p.text?.content?.includes("Short"))
          );
      if (isShort) {
        const id = v?.videoId ?? lv?.contentId ?? "";
        const title = v?.title?.runs?.[0]?.text
          ?? lv?.metadata?.lockupMetadataViewModel?.title?.content
          ?? "";
        shorts.push({ id, title });
      } else {
        videos++;
      }
    }
  }
  return { shorts, videos };
}

export async function shortCheck(cookies: Record<string, string>): Promise<ShortCheckResult> {
  const sapisid = cookies["SAPISID"] ?? cookies["__Secure-3PAPISID"];
  if (!sapisid) throw new Error("missing SAPISID — extension hasn't synced yet, or session expired");

  const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  const r = await fetch("https://www.youtube.com/youtubei/v1/browse?prettyPrint=false", {
    method: "POST",
    headers: {
      "Authorization": await sapisidHash(sapisid),
      "Content-Type": "application/json",
      "Origin": "https://www.youtube.com",
      "Cookie": cookieHeader,
      "X-Youtube-Client-Name": "1",
      "X-Youtube-Client-Version": CLIENT_VERSION,
    },
    body: JSON.stringify({
      context: { client: { clientName: "WEB", clientVersion: CLIENT_VERSION } },
      browseId: "FEhistory",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`youtube ${r.status}: ${(await r.text()).slice(0, 200)}`);

  const data = await r.json();
  const tracking = data?.responseContext?.serviceTrackingParams ?? [];
  const loggedIn = tracking.some((p: any) =>
    p.params?.some((pp: any) => pp.key === "logged_in" && pp.value === "1")
  );
  if (!loggedIn) throw new Error("youtube returned not-logged-in — cookies expired");

  const { shorts, videos } = parseHistory(data);
  return {
    watching: false, // handler computes from snapshot delta
    newShorts: 0,
    shortsCount: shorts.length,
    videosToday: videos,
    shorts,
    checked: new Date().toISOString(),
    elapsed: "",
  };
}
