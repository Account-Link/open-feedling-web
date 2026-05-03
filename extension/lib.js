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
