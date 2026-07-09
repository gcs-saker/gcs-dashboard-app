import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { apiUrl, apiV1Url, authUrl, streamApiV1Url } from "@/config";
import { AUTH_ROUTES, DASHBOARD_API_ROUTES, STREAM_API_ROUTES } from "@/features/apiRoutes";
import { server } from "./node";

const TEST_ORIGIN = "http://127.0.0.1:4178";

describe("MSW dashboard mock handlers", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  test("returns preview auth token for login", async () => {
    const response = await fetch(absoluteUrl(authUrl(AUTH_ROUTES.login)), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "operator01", password: "preview" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      access_token: "mock-access-token",
      username: "operator01",
      role: "operator",
    });
  });

  test("returns stream registry fixtures", async () => {
    const response = await fetch(absoluteUrl(streamApiV1Url(STREAM_API_ROUTES.streams)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          streamId: "raw.sample.front",
          status: "online",
        }),
      ]),
    );
  });

  test("returns stream playback, publish, and ICE fixtures", async () => {
    const playbackResponse = await fetch(absoluteUrl(streamApiV1Url(`${STREAM_API_ROUTES.streams}/raw.sample.front/playback`)));
    const publishResponse = await fetch(absoluteUrl(streamApiV1Url(`${STREAM_API_ROUTES.streams}/raw.sample.front/publish`)));
    const iceResponse = await fetch(absoluteUrl(streamApiV1Url(STREAM_API_ROUTES.iceServers)));

    expect(playbackResponse.status).toBe(200);
    await expect(playbackResponse.json()).resolves.toMatchObject({
      playbackUrls: {
        webrtc: "/webrtc/raw/sample/front/whep",
      },
      streamId: "raw.sample.front",
    });
    expect(publishResponse.status).toBe(200);
    await expect(publishResponse.json()).resolves.toMatchObject({
      streamId: "raw.sample.front",
      whipUrl: "/webrtc/raw/sample/front/whip",
    });
    expect(iceResponse.status).toBe(200);
    await expect(iceResponse.json()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ urls: "stun:stun.l.google.com:19302" })]),
    );
  });

  test("can force degraded stream scenario with query parameter", async () => {
    const response = await fetch(`${absoluteUrl(streamApiV1Url(STREAM_API_ROUTES.streams))}?mockScenario=stream-503`);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      detail: "mock stream registry degraded",
    });
  });

  test("can force auth 401 and 403 scenarios without real credentials", async () => {
    const loginResponse = await fetch(`${absoluteUrl(authUrl(AUTH_ROUTES.login))}?mockScenario=auth-500`, {
      method: "POST",
    });
    const refreshResponse = await fetch(`${absoluteUrl(authUrl(AUTH_ROUTES.refresh))}?mockScenario=auth-401`, {
      method: "POST",
    });
    const meResponse = await fetch(`${absoluteUrl(authUrl(AUTH_ROUTES.me))}?mockScenario=auth-403`);

    expect(loginResponse.status).toBe(500);
    await expect(loginResponse.json()).resolves.toMatchObject({ detail: "mock auth failure" });
    expect(refreshResponse.status).toBe(401);
    await expect(refreshResponse.json()).resolves.toMatchObject({ detail: "mock refresh expired" });
    expect(meResponse.status).toBe(403);
    await expect(meResponse.json()).resolves.toMatchObject({ detail: "mock operator forbidden" });
  });

  test("returns telemetry and operational event fixtures through dashboard API mocks", async () => {
    const telemetryResponse = await fetch(absoluteUrl(apiUrl(DASHBOARD_API_ROUTES.telemetryAll)));
    const telemetryHistoryResponse = await fetch(absoluteUrl(apiUrl(`${DASHBOARD_API_ROUTES.telemetryIngest}raw.sample.front${DASHBOARD_API_ROUTES.telemetryHistorySuffix}`)));
    const eventResponse = await fetch(absoluteUrl(apiUrl(DASHBOARD_API_ROUTES.operationalEvents)));

    expect(telemetryResponse.status).toBe(200);
    await expect(telemetryResponse.json()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ uuid: "raw.sample.front" })]),
    );
    expect(telemetryHistoryResponse.status).toBe(200);
    await expect(telemetryHistoryResponse.json()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ telemetry: expect.objectContaining({ uuid: "raw.sample.front" }) })]),
    );
    expect(eventResponse.status).toBe(200);
    await expect(eventResponse.json()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ eventType: "health.ok" })]),
    );
  });

  test("returns operational metric, bucket, health, stream session, and time fixtures", async () => {
    const metricResponse = await fetch(absoluteUrl(apiUrl(DASHBOARD_API_ROUTES.operationalEventMetrics)));
    const bucketResponse = await fetch(absoluteUrl(apiUrl(DASHBOARD_API_ROUTES.operationalEventBuckets)));
    const healthResponse = await fetch(absoluteUrl(apiUrl(DASHBOARD_API_ROUTES.serverHealthSnapshots)));
    const sessionResponse = await fetch(absoluteUrl(apiUrl(DASHBOARD_API_ROUTES.streamSessions)));
    const timeResponse = await fetch(absoluteUrl(apiUrl(DASHBOARD_API_ROUTES.timeSyncStatus)));

    expect(metricResponse.status).toBe(200);
    await expect(metricResponse.json()).resolves.toMatchObject({ totalEvents: 2 });
    expect(bucketResponse.status).toBe(200);
    await expect(bucketResponse.json()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ eventCount: 1 })]),
    );
    expect(healthResponse.status).toBe(200);
    await expect(healthResponse.json()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ serviceName: "auth-policy" })]),
    );
    expect(sessionResponse.status).toBe(200);
    await expect(sessionResponse.json()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ streamId: "raw.sample.front" })]),
    );
    expect(timeResponse.status).toBe(200);
    await expect(timeResponse.json()).resolves.toMatchObject({ status: "ok" });
  });

  test("can force telemetry and operational degraded scenarios", async () => {
    const telemetryResponse = await fetch(`${absoluteUrl(apiUrl(DASHBOARD_API_ROUTES.telemetryAll))}?mockScenario=telemetry-503`);
    const eventResponse = await fetch(`${absoluteUrl(apiUrl(DASHBOARD_API_ROUTES.operationalEvents))}?mockScenario=ops-503`);

    expect(telemetryResponse.status).toBe(503);
    await expect(telemetryResponse.json()).resolves.toMatchObject({ detail: "mock telemetry degraded" });
    expect(eventResponse.status).toBe(503);
    await expect(eventResponse.json()).resolves.toMatchObject({ detail: "mock operational event degraded" });
  });

  test("returns an SSE-like operational event stream fixture", async () => {
    const response = await fetch(absoluteUrl(apiUrl(DASHBOARD_API_ROUTES.operationalEventsStream)));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    await expect(response.text()).resolves.toContain("event: operational-event");
  });

  test("covers map config and debug beacon routes used by uiPreview runtime", async () => {
    const mapResponse = await fetch(absoluteUrl(apiV1Url(STREAM_API_ROUTES.mapConfig)));
    const debugResponse = await fetch(absoluteUrl("/client-debug/webrtc?stage=start&stream=raw.sample.front"), {
      method: "POST",
    });

    expect(mapResponse.status).toBe(200);
    await expect(mapResponse.json()).resolves.toMatchObject({
      provider: "esri-satellite",
      requiresApiKey: false,
    });
    expect(debugResponse.status).toBe(204);
  });
});

function absoluteUrl(path: string): string {
  return new URL(path, TEST_ORIGIN).toString();
}
