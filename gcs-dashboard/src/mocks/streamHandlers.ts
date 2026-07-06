import { http } from "msw";
import { streamApiV1Url } from "@/config";
import { STREAM_API_ROUTES } from "@/features/apiRoutes";
import { MOCK_STREAM_REGISTRY } from "./fixtures";
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
  http.get(urlPattern(streamApiV1Url(`${STREAM_API_ROUTES.streams}/:streamId/playback`)), ({ params }) =>
    json({
      streamId: String(params.streamId),
      status: "online",
      playbackUrls: {
        webrtc: `/webrtc/${String(params.streamId).replace(/\./g, "/")}/whep`,
        hls: `/hls/${String(params.streamId)}/index.m3u8`,
      },
    }),
  ),
  http.get(urlPattern(streamApiV1Url(`${STREAM_API_ROUTES.streams}/:streamId/publish`)), ({ params }) =>
    json({
      streamId: String(params.streamId),
      whipUrl: `/webrtc/${String(params.streamId).replace(/\./g, "/")}/whip`,
    }),
  ),
  http.get(urlPattern(streamApiV1Url(STREAM_API_ROUTES.mapConfig)), () =>
    json({
      provider: "esri-satellite",
      styleUrl: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "Esri World Imagery",
      requiresApiKey: false,
    }),
  ),
];
