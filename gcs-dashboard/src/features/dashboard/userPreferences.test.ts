import { afterEach, describe, expect, test, vi } from "vitest";
import { resetDashboardLayout } from "./dashboardLayout";
import {
  createDashboardUserPreferenceKey,
  createDefaultDashboardUserPreferences,
  normalizeDashboardUserPreferences,
} from "./userPreferences";
import { loadDashboardUserPreferences, saveDashboardUserPreferences } from "./userPreferencesStore";

describe("userPreferences", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("scopes browser preferences by a sanitized username", () => {
    expect(createDashboardUserPreferenceKey("operator01")).toBe("dashboard:operator01");
    expect(createDashboardUserPreferenceKey("unit/a@ops")).toBe("dashboard:unit_a_ops");
    expect(createDashboardUserPreferenceKey(null)).toBe("dashboard:preview");
  });

  test("normalizes persisted dashboard settings without trusting malformed records", () => {
    const defaultLayout = resetDashboardLayout();
    const preferences = normalizeDashboardUserPreferences({
      activeView: "cctv",
      cctvLayoutMode: "5x5",
      cctvQualityMode: "high",
      layout: [
        {
          ...defaultLayout[0],
          defaultPosition: { column: -1, columnSpan: 2, row: 0, rowSpan: 3 },
          pinned: true,
          visible: false,
        },
        { id: "unknown-widget", visible: true },
      ],
      streamPreferences: {
        deviceAliases: {
          "raw.sample.front": "전방 카메라",
          invalid: 42,
        },
      },
    });

    expect(preferences.activeView).toBe("cctv");
    expect(preferences.cctvLayoutMode).toBe("5x5");
    expect(preferences.cctvQualityMode).toBe("high");
    expect(preferences.layout).toHaveLength(defaultLayout.length);
    expect(preferences.layout[0]).toEqual(
      expect.objectContaining({
        defaultPosition: expect.objectContaining({ column: 1, columnSpan: 2, row: 1, rowSpan: 3 }),
        id: defaultLayout[0].id,
        pinned: true,
        visible: false,
      }),
    );
    expect(preferences.streamPreferences.deviceAliases).toEqual({
      "raw.sample.front": "전방 카메라",
    });
  });

  test("falls back to default preferences when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);

    await expect(loadDashboardUserPreferences("dashboard:operator01")).resolves.toEqual(
      createDefaultDashboardUserPreferences(),
    );
    await expect(saveDashboardUserPreferences("dashboard:operator01", createDefaultDashboardUserPreferences())).resolves.toBeUndefined();
  });
});
