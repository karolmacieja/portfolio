/** Whitelisted video embeds (the site CSP only allows these frame origins). */
export type VideoEmbed = { provider: "youtube" | "vimeo"; embedUrl: string };

export function parseVideoUrl(input: string): VideoEmbed | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^www\.|^m\./, "");

  let youtubeId: string | null = null;
  if (host === "youtu.be") youtubeId = url.pathname.slice(1).split("/")[0] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") youtubeId = url.searchParams.get("v");
    else {
      const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/);
      youtubeId = match?.[1] ?? null;
    }
  }
  if (youtubeId && /^[A-Za-z0-9_-]{11}$/.test(youtubeId)) {
    return { provider: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}` };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const match = url.pathname.match(/(?:^|\/)(\d{6,12})(?:\/|$)/);
    if (match) return { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${match[1]}?dnt=1` };
  }
  return null;
}
