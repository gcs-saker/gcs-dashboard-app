import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { resetDashboardLayout, type DashboardLayoutItem } from "@dashboard/layout/dashboardLayout";
import { useDashboardLayoutActions } from "./useDashboardLayoutActions";

describe("useDashboardLayoutActions", () => {
  test("updates pin and visibility state and resets the layout", () => {
    let layout = resetDashboardLayout();
    const resetWidgetLayout = vi.fn((next: DashboardLayoutItem[]) => { layout = next; });
    const setPopoutWidgetId = vi.fn();
    const setLayout = vi.fn((update: DashboardLayoutItem[] | ((current: DashboardLayoutItem[]) => DashboardLayoutItem[])) => {
      layout = typeof update === "function" ? update(layout) : update;
    });
    const { result } = renderHook(() => useDashboardLayoutActions({
      isWidgetPinned: () => false,
      resetWidgetLayout,
      setLayout,
      setPopoutWidgetId,
    }));

    act(() => result.current.toggleWidgetPin("tactical-map"));
    expect(layout.find((item) => item.id === "tactical-map")?.pinned).toBe(true);

    act(() => result.current.setWidgetVisible("tactical-map", false));
    expect(layout.find((item) => item.id === "tactical-map")?.visible).toBe(false);

    act(() => result.current.resetLayout());
    expect(resetWidgetLayout).toHaveBeenCalledWith(resetDashboardLayout());
    expect(setPopoutWidgetId).toHaveBeenCalledWith(null);
  });
});
