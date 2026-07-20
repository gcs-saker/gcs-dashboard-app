import { describe, expect, test } from "vitest";

import {
  SETTINGS_POLICIES,
  SETTINGS_TABS,
  settingsTabTitle,
  type PolicySettingsTab,
} from "./timeSyncSettingsContracts";

const POLICY_TABS: PolicySettingsTab[] = ["streaming", "security", "map", "account"];

describe("timeSyncSettingsContracts", () => {
  test("keeps all visible settings tabs in the intended order", () => {
    expect(SETTINGS_TABS.map((tab) => tab.id)).toEqual([
      "time",
      "streaming",
      "security",
      "provisioning",
      "motion",
      "map",
      "account",
    ]);
  });

  test("provides policy copy for every non-runtime settings tab", () => {
    for (const tab of POLICY_TABS) {
      expect(SETTINGS_POLICIES[tab]).toHaveLength(4);
      expect(settingsTabTitle(tab)).toContain(
        {
          streaming: "스트리밍",
          security: "인증",
          map: "지도",
          account: "계정",
        }[tab],
      );
    }
  });

  test("does not expose time or motion tabs as static policy tabs", () => {
    expect(Object.keys(SETTINGS_POLICIES)).not.toContain("time");
    expect(Object.keys(SETTINGS_POLICIES)).not.toContain("motion");
    expect(Object.keys(SETTINGS_POLICIES)).not.toContain("provisioning");
  });
});
