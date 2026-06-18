import { describe, expect, test } from "vitest";
import { AUTH_ROUTES, BACKEND_ROOT_ROUTES, DASHBOARD_API_ROUTES, STREAM_API_ROUTES } from "./apiRoutes";

describe("api route contracts", () => {
  test("keeps identity routes under the auth-policy auth root", () => {
    expect(AUTH_ROUTES).toMatchObject({
      login: "/login",
      refresh: "/refresh",
      logout: "/logout",
      signup: "/signup",
      me: "/me",
    });
  });

  test("keeps dashboard read-model routes compatible with the edge proxy", () => {
    expect(DASHBOARD_API_ROUTES).toMatchObject({
      assetByGatewayPrefix: "/asset/",
      telemetryAll: "/telemetry/all",
      telemetryIngest: "/telemetry/",
      operationalEvents: "/ops/events",
      operationalEventsPage: "/ops/events/page",
      operationalEventsStream: "/ops/events/stream",
      operationalEventMetrics: "/ops/events/metrics",
      operationalEventBuckets: "/ops/events/buckets",
      telemetryHistorySuffix: "/history",
    });
  });

  test("keeps operational root and media-control routes centralized", () => {
    expect(BACKEND_ROOT_ROUTES.streamStatus).toBe("/stream/status");
    expect(STREAM_API_ROUTES.streams).toBe("/streams");
    expect(STREAM_API_ROUTES.iceServers).toBe("/streams/ice-servers");
    expect(STREAM_API_ROUTES.mapConfig).toBe("/map/config");
  });
});
