import { describe, expect, test } from "vitest";

import {
  FRONTEND_QUERY_KEY_GROUPS,
  FRONTEND_STATE_BOUNDARY,
  FRONTEND_STATE_TOOLS,
} from "./frontendStateBoundaries";

describe("frontendStateBoundaries", () => {
  test("documents the frontend state ownership contracts", () => {
    expect(FRONTEND_STATE_TOOLS[FRONTEND_STATE_BOUNDARY.server]).toContain("Query");
    expect(FRONTEND_STATE_TOOLS[FRONTEND_STATE_BOUNDARY.ui]).toContain("reducer");
    expect(FRONTEND_STATE_TOOLS[FRONTEND_STATE_BOUNDARY.persistence]).toContain("IndexedDB");
  });

  test("keeps query key groups centralized", () => {
    expect(FRONTEND_QUERY_KEY_GROUPS.streaming).toEqual(["streaming"]);
    expect(FRONTEND_QUERY_KEY_GROUPS.operations).toEqual(["ops"]);
  });
});
