import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePublisherGpsTelemetry } from "@streaming/hooks/publishing/usePublisherGpsTelemetry";

describe("usePublisherGpsTelemetry", () => {
  it("coalesces rapid GPS updates while a telemetry request is in flight", async () => {
    let watchCallback: PositionCallback | null = null;
    let resolveFirstRequest!: (response: Response) => void;
    const firstRequest = new Promise<Response>((resolve) => { resolveFirstRequest = resolve; });
    const fetcher = vi.fn()
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValue(new Response(null, { status: 204 }));
    const geolocation = {
      clearWatch: vi.fn(),
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn((success: PositionCallback) => {
        watchCallback = success;
        return 7;
      }),
    } as unknown as Geolocation;
    const { result } = renderHook(() => usePublisherGpsTelemetry({ fetcher, geolocation, streamId: "opaque-stream" }));

    act(() => result.current.startGpsTelemetry());
    act(() => {
      watchCallback?.(position(35.1));
      watchCallback?.(position(35.2));
      watchCallback?.(position(35.3));
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    resolveFirstRequest(new Response(null, { status: 204 }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).latitude).toBe(35.3);
  });

  it("aborts the active request and ignores late positions after telemetry stops", () => {
    let watchCallback: PositionCallback | null = null;
    const fetcher = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(() => undefined));
    const geolocation = {
      clearWatch: vi.fn(),
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn((success: PositionCallback) => {
        watchCallback = success;
        return 9;
      }),
    } as unknown as Geolocation;
    const { result } = renderHook(() => usePublisherGpsTelemetry({ fetcher, geolocation, streamId: "opaque-stream" }));

    act(() => result.current.startGpsTelemetry());
    act(() => watchCallback?.(position(35.4)));
    const requestSignal = fetcher.mock.calls[0][1]?.signal;
    act(() => result.current.stopGpsTelemetry());
    act(() => watchCallback?.(position(35.5)));

    expect(requestSignal?.aborted).toBe(true);
    expect(geolocation.clearWatch).toHaveBeenCalledWith(9);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

function position(latitude: number): GeolocationPosition {
  return {
    coords: {
      accuracy: 1, altitude: 10, altitudeAccuracy: 1, heading: 0,
      latitude, longitude: 128.1, speed: 0,
    } as GeolocationCoordinates,
    timestamp: Date.now(),
  } as GeolocationPosition;
}
