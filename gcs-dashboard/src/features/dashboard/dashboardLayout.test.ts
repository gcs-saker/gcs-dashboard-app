import { describe, expect, test } from "vitest";
import {
  DASHBOARD_WIDGET_REGISTRY,
  getVisibleDashboardLayout,
  resetDashboardLayout,
  setDashboardWidgetPinned,
  updateDashboardWidgetPosition,
} from "./dashboardLayout";

describe("dashboardLayout", () => {
  test("keeps the M2 dashboard MVP as the default layout preset", () => {
    const layout = resetDashboardLayout();

    expect(layout.map((item) => item.id)).toEqual([
      "asset-tree",
      "tactical-map",
      "selected-stream",
      "stream-grid",
      "system-status",
      "telemetry-panel",
      "ai-results",
    ]);
    expect(layout.every((item) => item.visible)).toBe(true);
  });

  test("defines minimum dimensions for every dashboard widget", () => {
    expect(Object.values(DASHBOARD_WIDGET_REGISTRY)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "asset-tree", minWidth: 300, minHeight: 280 }),
        expect.objectContaining({ id: "stream-grid", minWidth: 360, minHeight: 220 }),
        expect.objectContaining({ id: "selected-stream", minWidth: 360, minHeight: 300 }),
      ]),
    );
  });

  test("updates widget position without mutating the previous layout", () => {
    const original = resetDashboardLayout();
    const updated = updateDashboardWidgetPosition(original, "stream-grid", {
      column: 2,
      row: 3,
      columnSpan: 2,
      rowSpan: 1,
    });

    expect(updated.find((item) => item.id === "stream-grid")?.defaultPosition).toEqual({
      column: 2,
      row: 3,
      columnSpan: 2,
      rowSpan: 1,
    });
    expect(original.find((item) => item.id === "stream-grid")?.defaultPosition).toEqual({
      column: 3,
      row: 2,
      columnSpan: 1,
      rowSpan: 1,
    });
  });

  test("clamps invalid widget positions to minimum grid values", () => {
    const updated = updateDashboardWidgetPosition(resetDashboardLayout(), "tactical-map", {
      column: 0,
      row: -1,
      columnSpan: 0,
      rowSpan: 0,
    });

    expect(updated.find((item) => item.id === "tactical-map")?.defaultPosition).toEqual({
      column: 1,
      row: 1,
      columnSpan: 1,
      rowSpan: 1,
    });
  });

  test("toggles pin state for later layout editing controls", () => {
    const pinned = setDashboardWidgetPinned(resetDashboardLayout(), "telemetry-panel", true);

    expect(pinned.find((item) => item.id === "telemetry-panel")?.pinned).toBe(true);
    expect(getVisibleDashboardLayout(pinned)).toHaveLength(7);
  });
});
