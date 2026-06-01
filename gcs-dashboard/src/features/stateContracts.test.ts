import { describe, expect, test } from "vitest";

import {
  DASHBOARD_GEOMETRY_SOURCE,
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
    expect(DASHBOARD_QUERY_KEYS.timeSyncStatus).toEqual(["dashboard", "time-sync-status"]);
    expect(DASHBOARD_QUERY_KEYS.streams).toEqual(["dashboard", "streams"]);
    expect(DASHBOARD_QUERY_KEYS.iceServers).toEqual(["streaming", "ice-servers"]);
  });
});
