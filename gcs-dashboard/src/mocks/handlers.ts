import { http, HttpResponse, type JsonBodyType } from "msw";
import { apiUrl, authUrl, streamApiV1Url } from "@/config";
import { AUTH_ROUTES, DASHBOARD_API_ROUTES, STREAM_API_ROUTES } from "@/features/apiRoutes";
import {
  MOCK_OPERATIONAL_BUCKETS,
  MOCK_OPERATIONAL_EVENTS,
  MOCK_OPERATIONAL_METRICS,
  MOCK_OPERATOR_TOKEN,
  MOCK_STREAM_REGISTRY,
  MOCK_TELEMETRY,
} from "./fixtures";

const JSON_HEADERS = Object.freeze({ "Content-Type": "application/json" });

export const handlers = [
  http.post(urlPattern(authUrl(AUTH_ROUTES.login)), ({ request }) => {
    if (hasScenario(request, MockScenario.AUTH_500)) {
      return json({ detail: "mock auth failure" }, 500);
    }
    return json(MOCK_OPERATOR_TOKEN);
  }),
  http.post(urlPattern(authUrl(AUTH_ROUTES.refresh)), ({ request }) => {
    if (hasScenario(request, MockScenario.AUTH_401)) {
      return json({ detail: "mock refresh expired" }, 401);
    }
    return json(MOCK_OPERATOR_TOKEN);
  }),
  http.post(urlPattern(authUrl(AUTH_ROUTES.logout)), () => new HttpResponse(null, { status: 204 })),
  http.post(urlPattern(authUrl(AUTH_ROUTES.signup)), () =>
    json({
      id: 3,
      username: "preview-user",
      email: "preview-user@example.test",
      company_id: 1,
      role: "viewer",
    }, 201),
  ),
  http.get(urlPattern(authUrl(AUTH_ROUTES.me)), () =>
    json({
      username: MOCK_OPERATOR_TOKEN.username,
      role: MOCK_OPERATOR_TOKEN.role,
    }),
  ),

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

  http.get(urlPattern(apiUrl(DASHBOARD_API_ROUTES.telemetryAll)), () => json(MOCK_TELEMETRY)),
  http.get(urlPattern(apiUrl(`${DASHBOARD_API_ROUTES.telemetryIngest}:uuid${DASHBOARD_API_ROUTES.telemetryHistorySuffix}`)), ({ params }) =>
    json([
      {
        recordedAt: "2026-06-29T00:00:00Z",
        telemetry: MOCK_TELEMETRY.find((item) => item.uuid === params.uuid) ?? MOCK_TELEMETRY[0],
      },
    ]),
  ),
  http.get(urlPattern(apiUrl(DASHBOARD_API_ROUTES.operationalEvents)), () => json(MOCK_OPERATIONAL_EVENTS)),
  http.get(urlPattern(apiUrl(DASHBOARD_API_ROUTES.operationalEventsPage)), () =>
    json({
      events: MOCK_OPERATIONAL_EVENTS,
      nextCursor: null,
    }),
  ),
  http.get(urlPattern(apiUrl(DASHBOARD_API_ROUTES.operationalEventMetrics)), () => json(MOCK_OPERATIONAL_METRICS)),
  http.get(urlPattern(apiUrl(DASHBOARD_API_ROUTES.operationalEventBuckets)), () => json(MOCK_OPERATIONAL_BUCKETS)),
  http.get(urlPattern(apiUrl(DASHBOARD_API_ROUTES.serverHealthSnapshots)), () =>
    json([
      {
        serviceName: "auth-policy",
        status: "ok",
        checkedAt: "2026-06-29T00:00:00Z",
        latencyMs: 32,
        details: "mock ready",
      },
    ]),
  ),
  http.get(urlPattern(apiUrl(DASHBOARD_API_ROUTES.streamSessions)), () =>
    json([
      {
        streamId: "raw.sample.front",
        title: "DRN-01 전방 EO",
        status: "online",
        source: "media-control",
        lastSeenAt: "2026-06-29T00:01:00Z",
      },
    ]),
  ),
  http.get(urlPattern(apiUrl(DASHBOARD_API_ROUTES.timeSyncStatus)), () =>
    json({
      mode: "public",
      sourceHost: "time.google.com",
      sourcePort: 123,
      driftMs: 2,
      status: "ok",
      checkedAt: "2026-06-29T00:00:00Z",
    }),
  ),
];

function json(payload: JsonBodyType, status = 200): HttpResponse<JsonBodyType> {
  return HttpResponse.json(payload, { status, headers: JSON_HEADERS });
}

function urlPattern(path: string): RegExp {
  const pathname = path.startsWith("http") ? new URL(path).pathname : path;
  const pattern = pathname
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/:streamId/g, "[^/?]+")
    .replace(/:uuid/g, "[^/?]+");
  return new RegExp(`${pattern}(?:\\?.*)?$`);
}

function hasScenario(request: Request, scenario: MockScenario): boolean {
  return new URL(request.url).searchParams.get(MockScenario.PARAM) === scenario;
}

enum MockScenario {
  PARAM = "mockScenario",
  AUTH_401 = "auth-401",
  AUTH_500 = "auth-500",
  STREAM_503 = "stream-503",
}
