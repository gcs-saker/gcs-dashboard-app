import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DashboardStreamSlot } from "@dashboard/streamTypes";
import { useStreamAvailabilityNotification } from "./useStreamAvailabilityNotification";

const offline: DashboardStreamSlot = {
  detail: "모바일 송출",
  id: "raw.mobile.front",
  mode: "EO",
  status: "offline",
  streamPath: "raw.mobile.front",
  title: "모바일 1",
};

describe("useStreamAvailabilityNotification", () => {
  it("signals and selects a stream when polling reports it online", () => {
    const onStreamAvailable = vi.fn();
    const { result, rerender } = renderHook(
      ({ streams }) => useStreamAvailabilityNotification(streams, onStreamAvailable),
      { initialProps: { streams: [offline] } },
    );

    act(() => rerender({ streams: [{ ...offline, status: "online" }] }));

    expect(onStreamAvailable).toHaveBeenCalledWith("raw.mobile.front");
    expect(result.current[0]).toMatchObject({
      message: "수신 가능한 스트림 감지: 모바일 1",
      streamId: "raw.mobile.front",
    });
  });
});
