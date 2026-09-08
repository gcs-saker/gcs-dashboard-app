import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import {
  DEFAULT_OPERATIONAL_EVENT_FILTERS,
  useEventLogActions,
  useEventLogFilterState,
  useEventLogStore,
} from "./useEventLogStore";

afterEach(() => {
  useEventLogStore.setState({
    categoryFilter: "all",
    filters: DEFAULT_OPERATIONAL_EVENT_FILTERS,
    selectedEventId: null,
    sourceFilter: "all",
  });
});

describe("useEventLogStore selectors", () => {
  test("exposes a narrow filter-state selector for event log views", () => {
    const { result } = renderHook(() => useEventLogFilterState());

    expect(result.current).toEqual({
      categoryFilter: "all",
      filters: DEFAULT_OPERATIONAL_EVENT_FILTERS,
      selectedEventId: null,
      sourceFilter: "all",
    });
  });

  test("exposes stable action selectors without leaking full store shape", () => {
    const { result } = renderHook(() => useEventLogActions());

    // oxlint-disable-next-line unicorn/no-array-sort -- The ES2022 test target sorts a newly owned key array.
    expect(Object.keys(result.current).sort()).toEqual([
      "patchFilters",
      "resetFilters",
      "setCategoryFilter",
      "setSelectedEventId",
      "setSourceFilter",
    ]);

    act(() => result.current.patchFilters({ severity: "warn" }));

    expect(useEventLogStore.getState().filters.severity).toBe("warn");
  });
});
