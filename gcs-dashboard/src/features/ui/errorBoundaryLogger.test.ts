import { describe, expect, it } from "vitest";

import { sanitizeErrorMessage } from "./errorBoundaryLogger";

describe("error boundary logger", () => {
  it("redacts secrets and URLs before telemetry leaves the boundary", () => {
    const message = sanitizeErrorMessage(
      new Error("failed Bearer abc.def.ghi access_token=secret-value https://internal.example/api"),
    );

    expect(message).not.toContain("abc.def.ghi");
    expect(message).not.toContain("secret-value");
    expect(message).not.toContain("internal.example");
    expect(message).toContain("[redacted]");
  });
});
