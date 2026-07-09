import { describe, expect, it } from "vitest";

import { DASHBOARD_STREAM_STATUS } from "@/features/stateContracts";
import { MOCK_OPERATIONAL_EVENTS } from "@mocks/fixtures";
import { STORY_OPERATIONAL_EVENTS, STORY_STREAM_LIST, STORY_STREAM_SLOTS } from "./dashboardStoryFixtures";

describe("dashboard story fixtures", () => {
  it("cover core stream UI states", () => {
    const statuses = STORY_STREAM_LIST.map((stream) => stream.status);

    expect(statuses).toEqual(
      expect.arrayContaining([
        DASHBOARD_STREAM_STATUS.offline,
        DASHBOARD_STREAM_STATUS.online,
        DASHBOARD_STREAM_STATUS.reconnecting,
        DASHBOARD_STREAM_STATUS.error,
        DASHBOARD_STREAM_STATUS.fallback,
      ]),
    );
  });

  it("reuse operational event mock fixtures", () => {
    expect(STORY_OPERATIONAL_EVENTS[0]).toBe(MOCK_OPERATIONAL_EVENTS[0]);
    expect(STORY_OPERATIONAL_EVENTS.length).toBeGreaterThan(MOCK_OPERATIONAL_EVENTS.length);
  });

  it("keep map and audio stories bound to the same selected stream", () => {
    expect(STORY_STREAM_SLOTS.live.geometry?.source).toBe("telemetry");
    expect(STORY_STREAM_SLOTS.live.streamPath).toBe("raw.sample.front");
  });
});
