import { http, HttpResponse } from "msw";
import { apiV1Url, streamApiV1Url } from "@/config";
import { STREAM_API_ROUTES } from "@/features/apiRoutes";
import { MOCK_MAP_CONFIG, MOCK_STREAM_REGISTRY } from "./fixtures";
import { hasScenario, json, MockScenario, urlPattern } from "./handlerUtils";

export const streamHandlers = [
  http.get(urlPattern(streamApiV1Url(STREAM_API_ROUTES.streams)), ({ request }) => {
    if (hasScenario(request, MockScenario.STREAM_503)) {
      return json({ detail: "mock stream registry degraded" }, 503);
    }
    return json(MOCK_STREAM_REGISTRY);
  }),
  http.get(urlPattern(streamApiV1Url(STREAM_API_ROUTES.iceServers)), () =>
    json([
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "turn:127.0.0.1:3478?transport=udp", username: "preview", credential: "preview" },
    ]),
  ),
  http.get(urlPattern(streamApiV1Url(`${STREAM_API_ROUTES.streams}/:streamId/playback`)), ({ request }) => {
    const streamId = streamIdFromRequest(request.url, "/playback");
    return json({
      streamId,
      status: "online",
      playbackUrls: {
        webrtc: `/webrtc/${streamId.replace(/\./g, "/")}/whep`,
        hls: `/hls/${streamId}/index.m3u8`,
      },
    });
  }),
  http.get(urlPattern(streamApiV1Url(`${STREAM_API_ROUTES.streams}/:streamId/publish`)), ({ request }) => {
    const streamId = streamIdFromRequest(request.url, "/publish");
    return json({
      streamId,
      whipUrl: `/webrtc/${streamId.replace(/\./g, "/")}/whip`,
    });
  }),
  http.get(urlPattern(streamApiV1Url(STREAM_API_ROUTES.mapConfig)), () =>
    json(MOCK_MAP_CONFIG),
  ),
  http.get(urlPattern(apiV1Url(STREAM_API_ROUTES.mapConfig)), () =>
    json(MOCK_MAP_CONFIG),
  ),
  http.get(urlPattern("/client-debug/webrtc"), () => new HttpResponse(null, { status: 204 })),
  http.post(urlPattern("/client-debug/webrtc"), () => new HttpResponse(null, { status: 204 })),
];

function streamIdFromRequest(requestUrl: string, suffix: string): string {
  const pathname = new URL(requestUrl).pathname;
  const streamPath = pathname.split(`${STREAM_API_ROUTES.streams}/`)[1] ?? "unknown";
  return decodeURIComponent(streamPath.replace(suffix, ""));
}
