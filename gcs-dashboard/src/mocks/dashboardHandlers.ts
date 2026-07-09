import { http } from "msw";
import { apiUrl } from "@/config";
import { DASHBOARD_API_ROUTES } from "@/features/apiRoutes";
import {
  MOCK_OPERATIONAL_BUCKETS,
  MOCK_OPERATIONAL_EVENTS,
  MOCK_OPERATIONAL_METRICS,
  MOCK_TELEMETRY,
} from "./fixtures";
import { eventStream, hasScenario, json, MockScenario, urlPattern } from "./handlerUtils";

export const dashboardHandlers = [
  http.get(urlPattern(apiUrl(DASHBOARD_API_ROUTES.telemetryAll)), ({ request }) => {
    if (hasScenario(request, MockScenario.TELEMETRY_503)) {
      return json({ detail: "mock telemetry degraded" }, 503);
    }
    return json(MOCK_TELEMETRY);
  }),
  http.get(urlPattern(apiUrl(`${DASHBOARD_API_ROUTES.telemetryIngest}:uuid${DASHBOARD_API_ROUTES.telemetryHistorySuffix}`)), ({ params, request }) => {
    if (hasScenario(request, MockScenario.TELEMETRY_503)) {
      return json({ detail: "mock telemetry history degraded" }, 503);
    }
    return json([
      {
        recordedAt: "2026-06-29T00:00:00Z",
        telemetry: MOCK_TELEMETRY.find((item) => item.uuid === params.uuid) ?? MOCK_TELEMETRY[0],
      },
    ]);
  }),
  http.get(urlPattern(apiUrl(DASHBOARD_API_ROUTES.operationalEvents)), ({ request }) => {
    if (hasScenario(request, MockScenario.OPS_503)) {
      return json({ detail: "mock operational event degraded" }, 503);
    }
    return json(MOCK_OPERATIONAL_EVENTS);
  }),
  http.get(urlPattern(apiUrl(DASHBOARD_API_ROUTES.operationalEventsPage)), ({ request }) => {
    if (hasScenario(request, MockScenario.OPS_503)) {
      return json({ detail: "mock operational event page degraded" }, 503);
    }
    return json({
      events: MOCK_OPERATIONAL_EVENTS,
      nextCursor: null,
    });
  }),
  http.get(urlPattern(apiUrl(DASHBOARD_API_ROUTES.operationalEventsStream)), () =>
    eventStream([
      `event: operational-event\ndata: ${JSON.stringify(MOCK_OPERATIONAL_EVENTS[0])}`,
      `event: heartbeat\ndata: ${JSON.stringify({ checkedAt: "2026-06-29T00:00:30Z" })}`,
    ]),
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
