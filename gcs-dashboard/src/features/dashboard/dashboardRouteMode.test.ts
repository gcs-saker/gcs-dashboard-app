import { describe, expect, test } from "vitest";
import { dashboardRouteMode } from "./dashboardRouteMode";

describe("dashboardRouteMode", () => {
  test("reserves the stream route for the receiver-focused dashboard", () => {
    expect(dashboardRouteMode("/stream")).toBe("receiver");
    expect(dashboardRouteMode("/stream/live")).toBe("receiver");
    expect(dashboardRouteMode("/")).toBe("operations");
    expect(dashboardRouteMode("/events")).toBe("operations");
  });
});
