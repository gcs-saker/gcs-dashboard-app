import type { StreamPlaybackResponse } from "@streaming/types";

const LOCAL_MEDIA_HOSTS = Object.freeze(new Set(["localhost", "127.0.0.1", "::1"]));

export function normalizePlaybackResponse(playback: StreamPlaybackResponse): StreamPlaybackResponse {
  return {
    ...playback,
    playbackUrls: {
      webrtc: normalizeBrowserMediaUrl(playback.playbackUrls.webrtc),
      hls: normalizeBrowserMediaUrl(playback.playbackUrls.hls),
    },
  };
}

export function normalizeBrowserMediaUrl(url: string | null, pageHref?: string): string | null {
  if (!url || typeof window === "undefined") return url;

  const resolvedPageHref = pageHref ?? window.location.href;
  const pageUrl = new URL(resolvedPageHref);
  const mediaUrl = new URL(url, pageUrl.href);
  const isLocalMediaUrl = LOCAL_MEDIA_HOSTS.has(mediaUrl.hostname);
  const isLocalPage = LOCAL_MEDIA_HOSTS.has(pageUrl.hostname);

  if (isLocalMediaUrl && !isLocalPage) {
    return `${pageUrl.origin}${mediaUrl.pathname}${mediaUrl.search}${mediaUrl.hash}`;
  }

  if (pageUrl.protocol === "https:" && mediaUrl.protocol === "http:" && mediaUrl.hostname === pageUrl.hostname) {
    mediaUrl.protocol = "https:";
    return mediaUrl.toString();
  }

  return url;
}
