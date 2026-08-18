import { describe, expect, test } from "vitest";
import { DEFAULT_DASHBOARD_STREAMS } from "./dashboardDefaultStreams";

describe("dashboard default streams", () => {
  test("do not issue playback requests for production sample paths", () => {
    expect(DEFAULT_DASHBOARD_STREAMS.every((stream) => stream.status === "offline")).toBe(true);
    expect(DEFAULT_DASHBOARD_STREAMS.every((stream) => stream.streamPath === null)).toBe(true);
  });
});
