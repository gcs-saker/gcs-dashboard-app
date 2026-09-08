import { describe, expect, test } from "vitest";

import {
  DASHBOARD_GEOMETRY_SOURCE,
  DASHBOARD_QUERY_KEY_FACTORY,
  DASHBOARD_QUERY_KEYS,
  DASHBOARD_SERVER_HEALTH,
  DASHBOARD_STREAM_MODE,
  DASHBOARD_STREAM_STATUS,
} from "@/features/stateContracts";

describe("dashboard state contracts", () => {
  test("keeps server health status values centralized", () => {
    expect(DASHBOARD_SERVER_HEALTH).toEqual({
      online: "online",
      degraded: "degraded",
      error: "error",
    });
  });

  test("keeps stream status and mode values centralized", () => {
    expect(DASHBOARD_STREAM_STATUS).toEqual({
      online: "online",
      fallback: "fallback",
      offline: "offline",
      error: "error",
      reconnecting: "reconnecting",
      degraded: "degraded",
    });
    expect(DASHBOARD_STREAM_MODE).toEqual({
      eo: "EO",
      ir: "IR",
      ai: "AI",
      map: "MAP",
    });
  });

  test("keeps geometry source values centralized", () => {
    expect(DASHBOARD_GEOMETRY_SOURCE).toEqual({
      mock: "mock",
      registry: "registry",
      telemetry: "telemetry",
      device: "device",
    });
  });

  test("keeps query keys readonly and stable", () => {
    expect(DASHBOARD_QUERY_KEYS.serverStatus).toEqual(["dashboard", "server-status"]);
    expect(DASHBOARD_QUERY_KEYS.operationalEvents).toEqual(["dashboard", "operational-events"]);
    expect(DASHBOARD_QUERY_KEYS.operationalEventMetrics).toEqual(["dashboard", "operational-event-metrics"]);
    expect(DASHBOARD_QUERY_KEYS.operationalEventBuckets).toEqual(["dashboard", "operational-event-buckets"]);
    expect(DASHBOARD_QUERY_KEYS.serverHealthSnapshots).toEqual(["dashboard", "server-health-snapshots"]);
    expect(DASHBOARD_QUERY_KEYS.streamSessions).toEqual(["dashboard", "stream-sessions"]);
    expect(DASHBOARD_QUERY_KEYS.telemetryHistory).toEqual(["dashboard", "telemetry-history"]);
    expect(DASHBOARD_QUERY_KEYS.timeSyncStatus).toEqual(["dashboard", "time-sync-status"]);
    expect(DASHBOARD_QUERY_KEYS.streams).toEqual(["dashboard", "streams"]);
    expect(DASHBOARD_QUERY_KEYS.iceServers).toEqual(["streaming", "ice-servers"]);
  });

  test("builds typed query keys from a single factory boundary", () => {
    expect(DASHBOARD_QUERY_KEY_FACTORY.serverStatus(5000, "default-fetcher")).toEqual([
      "dashboard",
      "server-status",
      { refreshMs: 5000, fetcherMode: "default-fetcher" },
    ]);
    expect(DASHBOARD_QUERY_KEY_FACTORY.operationalEvents("operator-a", { severity: "warn" })).toEqual([
      "dashboard",
      "operational-events",
      "operator-a",
      { severity: "warn" },
    ]);
    expect(DASHBOARD_QUERY_KEY_FACTORY.operationalEventMetrics("operator-a", { category: "network" })).toEqual([
      "dashboard",
      "operational-event-metrics",
      "operator-a",
      { category: "network" },
    ]);
  });
});
