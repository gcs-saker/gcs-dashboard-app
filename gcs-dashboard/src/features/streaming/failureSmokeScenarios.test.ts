import { describe, expect, test } from "vitest";

import {
  FAILURE_SMOKE_SCENARIOS,
  browserSmokeScenarioIds,
  requiredFailureSmokeScenarioIds,
} from "./failureSmokeScenarios";

describe("failureSmokeScenarios", () => {
  test("documents at least three operational failure cases", () => {
    expect(FAILURE_SMOKE_SCENARIOS.length).toBeGreaterThanOrEqual(3);
    expect(requiredFailureSmokeScenarioIds()).toEqual(
      expect.arrayContaining(["backend-api-down", "playback-api-failure", "mediamtx-down"]),
    );
  });

  test("defines expected user state and containment for every scenario", () => {
    for (const scenario of FAILURE_SMOKE_SCENARIOS) {
      expect(scenario.expectedUserState.length).toBeGreaterThan(12);
      expect(scenario.containment.length).toBeGreaterThan(12);
      expect(scenario.automation.length).toBeGreaterThan(0);
    }
  });

  test("marks browser smoke scenarios that need real runtime verification", () => {
    expect(browserSmokeScenarioIds()).toEqual(
      expect.arrayContaining(["backend-api-down", "mediamtx-down"]),
    );
  });
});
