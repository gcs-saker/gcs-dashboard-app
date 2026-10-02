import { describe, expect, test } from "vitest";
import {
  loadEventLogView,
  loadTacticalLeafletMap,
  loadTimeSyncSettingsView,
  preloadDashboardLazyViews,
} from "@dashboard/layout/dashboardLazyViews";

describe("dashboardLazyViews", () => {
  test("loads dashboard chunks through explicit named module boundaries", async () => {
    const [eventLog, timeSync, tacticalMap] = await Promise.all([
      loadEventLogView(),
      loadTimeSyncSettingsView(),
      loadTacticalLeafletMap(),
    ]);

    expect(eventLog).toHaveProperty("EventLogView");
    expect(timeSync).toHaveProperty("TimeSyncSettingsView");
    expect(tacticalMap).toHaveProperty("TacticalLeafletMap");
  }, 10_000);

  test("preloads all heavy dashboard views without blocking the render path", () => {
    expect(() => preloadDashboardLazyViews()).not.toThrow();
  });
});
