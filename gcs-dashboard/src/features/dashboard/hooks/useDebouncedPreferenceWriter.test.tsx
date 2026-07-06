import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createDefaultDashboardUserPreferences } from "@dashboard/userPreferences";
import { useDebouncedPreferenceWriter } from "./useDebouncedPreferenceWriter";

const saveDashboardUserPreferences = vi.fn();

vi.mock("@dashboard/userPreferencesStore", () => ({
  saveDashboardUserPreferences: (...args: unknown[]) => saveDashboardUserPreferences(...args),
}));

describe("useDebouncedPreferenceWriter", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  test("coalesces rapid preference writes into one IndexedDB save", () => {
    vi.useFakeTimers();
    const first = createDefaultDashboardUserPreferences();
    const second = { ...first, activeView: "events" as const };
    const { result } = renderHook(() => useDebouncedPreferenceWriter(100));

    result.current.schedulePreferenceSave("dashboard:operator01", first);
    result.current.schedulePreferenceSave("dashboard:operator01", second);
    vi.advanceTimersByTime(99);

    expect(saveDashboardUserPreferences).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(saveDashboardUserPreferences).toHaveBeenCalledTimes(1);
    expect(saveDashboardUserPreferences).toHaveBeenCalledWith("dashboard:operator01", second);
  });

  test("flushes the latest pending save on unmount", () => {
    vi.useFakeTimers();
    const preferences = { ...createDefaultDashboardUserPreferences(), activeView: "settings" as const };
    const { result, unmount } = renderHook(() => useDebouncedPreferenceWriter(100));

    result.current.schedulePreferenceSave("dashboard:operator01", preferences);
    unmount();

    expect(saveDashboardUserPreferences).toHaveBeenCalledWith("dashboard:operator01", preferences);
  });
});
