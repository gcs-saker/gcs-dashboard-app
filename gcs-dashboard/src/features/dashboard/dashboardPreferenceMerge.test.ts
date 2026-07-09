import { describe, expect, test } from "vitest";
import { createDefaultDashboardUserPreferences } from "./userPreferences";
import { mergeDashboardPreferencesWithStreamAliases } from "./dashboardPreferenceMerge";

describe("dashboardPreferenceMerge", () => {
  test("lets the dedicated stream alias store override legacy aliases in user preferences", () => {
    const preferences = {
      ...createDefaultDashboardUserPreferences(),
      streamPreferences: {
        deviceAliases: {
          "raw.mobile.front": "기존 이름",
          "raw.mobile.side": "측면",
        },
      },
    };

    expect(mergeDashboardPreferencesWithStreamAliases(preferences, {
      "raw.mobile.front": "전방 단말",
      "raw.mobile.rear": "후방 단말",
    }).streamPreferences.deviceAliases).toEqual({
      "raw.mobile.front": "전방 단말",
      "raw.mobile.rear": "후방 단말",
      "raw.mobile.side": "측면",
    });
  });
});
