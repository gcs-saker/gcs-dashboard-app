import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AuthApiError } from "@auth/authApi";

import { markOnlineStreamsDegraded, refreshStreamDevicesOnce, useStreamDevicePolling } from "@dashboard/hooks/assets/useStreamDevicePolling";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import type { StreamDeviceOption } from "@dashboard/assets/streamDevices";

const baseStream = {
  detail: "테스트 스트림",
  id: "raw.test.stream",
  mode: "EO",
  streamPath: "raw.test.stream",
  title: "테스트",
} satisfies Omit<DashboardStreamSlot, "status">;

afterEach(() => vi.useRealTimers());

describe("useStreamDevicePolling", () => {
  test("does not overlap registry requests when a response is slow", async () => {
    vi.useFakeTimers();
    let resolveRequest!: (devices: StreamDeviceOption[]) => void;
    const fetchDevices = vi.fn(() => new Promise<StreamDeviceOption[]>((resolve) => { resolveRequest = resolve; }));
    const { unmount } = renderHook(() => useStreamDevicePolling({
      fetchDevices,
      preferences: { deviceAliases: {} },
      setSelectedStreamId: vi.fn(),
      setStreamDevices: vi.fn(),
      setStreams: vi.fn(),
    }));

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(fetchDevices).toHaveBeenCalledTimes(1);

    resolveRequest([]);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(fetchDevices).toHaveBeenCalledTimes(2);
    unmount();
  });

  test("backs off registry polling after transient failures", async () => {
    vi.useFakeTimers();
    const fetchDevices = vi.fn().mockRejectedValue(new Error("temporary upstream failure"));
    const { unmount } = renderHook(() => useStreamDevicePolling({
      fetchDevices,
      preferences: { deviceAliases: {} },
      setSelectedStreamId: vi.fn(),
      setStreamDevices: vi.fn(),
      setStreams: vi.fn(),
    }));

    await act(async () => { await Promise.resolve(); });
    expect(fetchDevices).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_999); });
    expect(fetchDevices).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetchDevices).toHaveBeenCalledTimes(2);
    unmount();
  });
});

describe("markOnlineStreamsDegraded", () => {
  test("marks only online streams as degraded after polling failures", () => {
    const streams: DashboardStreamSlot[] = [
      { ...baseStream, id: "online", status: "online" },
      { ...baseStream, id: "offline", status: "offline" },
      { ...baseStream, id: "error", status: "error" },
    ];

    expect(markOnlineStreamsDegraded(streams).map((stream) => stream.status)).toEqual([
      "degraded",
      "offline",
      "error",
    ]);
  });

  test("keeps the same stream array when no stream needs a degraded transition", () => {
    const streams: DashboardStreamSlot[] = [
      { ...baseStream, id: "offline", status: "offline" },
      { ...baseStream, id: "degraded", status: "degraded" },
    ];

    expect(markOnlineStreamsDegraded(streams)).toBe(streams);
  });
});

describe("refreshStreamDevicesOnce", () => {
  test("merges fetched devices and updates selected stream through state updaters", async () => {
    let streams: DashboardStreamSlot[] = [{ ...baseStream, id: "slot-1", status: "offline", streamPath: null }];
    let streamDevices: StreamDeviceOption[] = [];
    let selectedStreamId = "slot-1";
    const device: StreamDeviceOption = {
      geometry: {
        altitudeM: 0,
        fovDeg: 72,
        headingDeg: 0,
        lat: 35.87143,
        lng: 128.60144,
        pitchDeg: 0,
        rollDeg: 0,
        source: "device",
        yawDeg: 0,
      },
      id: "device-1",
      mediaType: "eo",
      name: "전방 단말",
      status: "online",
      streamPath: "raw.mobile.front",
    };

    await refreshStreamDevicesOnce({
      fetchDevices: async () => [device],
      preferences: { deviceAliases: { "device-1": "별칭 단말" } },
      setSelectedStreamId: (updater) => {
        selectedStreamId = typeof updater === "function" ? updater(selectedStreamId) : updater;
      },
      setStreamDevices: (updater) => {
        streamDevices = typeof updater === "function" ? updater(streamDevices) : updater;
      },
      setStreams: (updater) => {
        streams = typeof updater === "function" ? updater(streams) : updater;
      },
    });

    expect(streamDevices[0].name).toBe("별칭 단말");
    expect(streams[0]).toMatchObject({ streamPath: "raw.mobile.front", status: "online" });
    expect(selectedStreamId).toBe("raw.mobile.front");
  });

  test("stops polling and reports auth failure on 401", async () => {
    let stopped = false;
    let authFailed = false;
    let streams: DashboardStreamSlot[] = [{ ...baseStream, id: "online", status: "online" }];

    await refreshStreamDevicesOnce({
      fetchDevices: async () => {
        throw new AuthApiError(401, "expired");
      },
      onAuthFailure: () => {
        authFailed = true;
      },
      preferences: { deviceAliases: {} },
      setSelectedStreamId: () => undefined,
      setStreamDevices: () => undefined,
      setStreams: (updater) => {
        streams = typeof updater === "function" ? updater(streams) : updater;
      },
      stopPolling: () => {
        stopped = true;
      },
    });

    expect(stopped).toBe(true);
    expect(authFailed).toBe(true);
    expect(streams[0].status).toBe("online");
  });
});
