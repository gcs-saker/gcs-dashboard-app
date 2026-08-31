import type { HLSLatencyMode } from "@streaming/types";

const PLAYBACK_TOKEN_QUERY_KEY = "playbackToken";

const HLS_LOW_LATENCY_CONFIG = Object.freeze({
  lowLatencyMode: true,
  backBufferLength: 10,
  liveSyncDurationCount: 2,
  maxLiveSyncPlaybackRate: 1.5,
  capLevelToPlayerSize: true,
});

const HLS_STABLE_CONFIG = Object.freeze({
  lowLatencyMode: false,
  backBufferLength: 30,
  liveSyncDurationCount: 4,
  maxLiveSyncPlaybackRate: 1.2,
  capLevelToPlayerSize: true,
});

export function hlsConfigForLatencyMode(latencyMode: HLSLatencyMode, hlsUrl: string): Record<string, unknown> {
  return {
    ...(latencyMode === "low-latency" ? HLS_LOW_LATENCY_CONFIG : HLS_STABLE_CONFIG),
    xhrSetup: (xhr: XMLHttpRequest, url: string) => {
      const authenticatedUrl = appendHlsPlaybackQuery(url, hlsUrl);
      if (authenticatedUrl !== url) {
        xhr.open("GET", authenticatedUrl, true);
      }
    },
  };
}

export function appendHlsPlaybackQuery(requestUrl: string, hlsUrl: string): string {
  try {
    const source = new URL(hlsUrl, window.location.href);
    const token = source.searchParams.get(PLAYBACK_TOKEN_QUERY_KEY);
    if (!token) {
      return requestUrl;
    }

    const request = new URL(requestUrl, source.href);
    if (request.searchParams.has(PLAYBACK_TOKEN_QUERY_KEY)) {
      return requestUrl;
    }
    request.searchParams.set(PLAYBACK_TOKEN_QUERY_KEY, token);
    return request.toString();
  } catch {
    return requestUrl;
  }
}
