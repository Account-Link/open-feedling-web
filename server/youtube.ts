// Fetches youtube.com/feed/history as HTML and parses the embedded ytInitialData.
// The InnerTube `/youtubei/v1/browse?browseId=FEhistory` endpoint returns a stale
// view (no "Today" section even when the rendered page has one) — the HTML path
// matches what the user sees in their tab. No JS execution required since
// ytInitialData is already serialized into the page.

export interface ShortCheckResult {
  watching: boolean;
  newShorts: number;
  shortsCount: number;
  videosToday: number;
  shorts: { id: string; title: string }[];
  checked: string;
  elapsed: string;
}

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function parseHistory(data: any): { shorts: { id: string; title: string }[]; videos: number } {
  const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs ?? [];
  const sections = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents ?? [];
  const shorts: { id: string; title: string }[] = [];
  let videos = 0;
  for (const section of sections) {
    const items = section?.itemSectionRenderer?.contents ?? [];
    for (const item of items) {
      if (item.reelShelfRenderer) {
        for (const reel of item.reelShelfRenderer.items ?? []) {
          const slv = reel.shortsLockupViewModel;
          if (!slv) continue;
          const id = slv.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId ?? "";
          const title = slv.overlayMetadata?.primaryText?.content ?? "";
          shorts.push({ id, title });
        }
        continue;
      }
      const v = item.videoRenderer;
      if (v) {
        const isShort = (v.thumbnailOverlays ?? []).some((o: any) =>
          o.thumbnailOverlayTimeStatusRenderer?.style === "SHORTS");
        if (isShort) shorts.push({ id: v.videoId ?? "", title: v.title?.runs?.[0]?.text ?? "" });
        else videos++;
        continue;
      }
      if (item.lockupViewModel) videos++;
    }
  }
  return { shorts, videos };
}

export async function shortCheck(cookies: Record<string, string>): Promise<ShortCheckResult> {
  const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  const r = await fetch("https://www.youtube.com/feed/history", {
    headers: {
      "Cookie": cookieHeader,
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`youtube history ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const html = await r.text();
  const m = html.match(/var ytInitialData\s*=\s*(\{[\s\S]+?\});\s*<\/script>/);
  if (!m) throw new Error("ytInitialData not found — cookies likely invalid");
  const data = JSON.parse(m[1]);
  const tracking = data?.responseContext?.serviceTrackingParams ?? [];
  const loggedIn = tracking.some((p: any) =>
    p.params?.some((pp: any) => pp.key === "logged_in" && pp.value === "1")
  );
  if (!loggedIn) throw new Error("youtube returned not-logged-in — cookies expired");

  const { shorts, videos } = parseHistory(data);
  return {
    watching: false,
    newShorts: 0,
    shortsCount: shorts.length,
    videosToday: videos,
    shorts,
    checked: new Date().toISOString(),
    elapsed: "",
  };
}
