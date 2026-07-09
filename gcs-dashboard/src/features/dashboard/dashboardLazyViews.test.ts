import { describe, expect, test } from "vitest";
import {
  loadEventLogView,
  loadTacticalLeafletMap,
  loadTimeSyncSettingsView,
  preloadDashboardLazyViews,
} from "./dashboardLazyViews";

describe("dashboardLazyViews", () => {
  test("loads dashboard chunks through explicit named module boundaries", async () => {
    await expect(loadEventLogView()).resolves.toHaveProperty("EventLogView");
    await expect(loadTimeSyncSettingsView()).resolves.toHaveProperty("TimeSyncSettingsView");
    await expect(loadTacticalLeafletMap()).resolves.toHaveProperty("TacticalLeafletMap");
  });

  test("preloads all heavy dashboard views without blocking the render path", () => {
    expect(() => preloadDashboardLazyViews()).not.toThrow();
  });
});
