import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { fetchCameraControlCommand } from "@streaming/publisher/cameraControlApi";
import type { LocalWebcamPublisherRuntime } from "./useLocalWebcamPublisherRuntime";
import { useRemoteCameraControl } from "./useRemoteCameraControl";

vi.mock("@streaming/publisher/cameraControlApi", () => ({ fetchCameraControlCommand: vi.fn() }));

describe("useRemoteCameraControl", () => {
  beforeEach(() => vi.mocked(fetchCameraControlCommand).mockReset());
  test("replaces the live video track while preserving the publisher session", async () => {
    vi.mocked(fetchCameraControlCommand).mockResolvedValue({ facingMode: "rear", revision: 1 });
    const previousTrack = { kind: "video", stop: vi.fn() } as unknown as MediaStreamTrack;
    const nextTrack = { kind: "video", stop: vi.fn() } as unknown as MediaStreamTrack;
    const replaceTrack = vi.fn(async () => undefined);
    const removeTrack = vi.fn();
    const addTrack = vi.fn();
    const stream = { getVideoTracks: () => [previousTrack], removeTrack, addTrack } as unknown as MediaStream;
    const runtime = {
      peerConnectionRef: { current: { getSenders: () => [{ track: previousTrack, replaceTrack }] } },
      setErrorMessage: vi.fn(),
      setSelectedVideoDeviceId: vi.fn(),
      streamRef: { current: stream },
      videoRef: { current: null },
    } as unknown as LocalWebcamPublisherRuntime;
    const mediaDevices = {
      getUserMedia: vi.fn(async () => ({ getVideoTracks: () => [nextTrack] } as unknown as MediaStream)),
    } as unknown as MediaDevices;

    const view = renderHook(() => useRemoteCameraControl({
      enabled: true, fetcher: vi.fn() as unknown as typeof fetch, mediaDevices,
      runtime, streamId: "raw.mobile.front",
    }));

    await waitFor(() => expect(replaceTrack).toHaveBeenCalledWith(nextTrack));
    expect(previousTrack.stop).toHaveBeenCalled();
    expect(removeTrack).toHaveBeenCalledWith(previousTrack);
    expect(addTrack).toHaveBeenCalledWith(nextTrack);
    view.unmount();
  });

  test("does not poll before media capture is active", () => {
    const runtime = { streamRef: { current: null } } as unknown as LocalWebcamPublisherRuntime;
    renderHook(() => useRemoteCameraControl({ enabled: false, fetcher: fetch,
      mediaDevices: navigator.mediaDevices, runtime, streamId: "raw.mobile.front" }));
    expect(fetchCameraControlCommand).not.toHaveBeenCalled();
  });
});
