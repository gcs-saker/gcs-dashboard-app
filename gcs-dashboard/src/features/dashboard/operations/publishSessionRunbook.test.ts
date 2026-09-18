import { describe, expect, test } from "vitest";

import { publishSessionRunbook } from "./publishSessionRunbook";

describe("publishSessionRunbook", () => {
  test("maps only bounded readiness reasons to delivery runbook guidance", () => {
    expect(publishSessionRunbook("store_unavailable")?.id).toBe("RUN-PUB-01");
    expect(publishSessionRunbook("scan_truncated")?.id).toBe("RUN-PUB-02");
    expect(publishSessionRunbook("session_age_exceeded")?.id).toBe("RUN-PUB-03");
    expect(publishSessionRunbook("private redis error")).toBeNull();
    expect(publishSessionRunbook(null)).toBeNull();
  });
});
