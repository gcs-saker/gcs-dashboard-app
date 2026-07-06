import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePublisherMediaDevices } from "./usePublisherMediaDevices";

describe("usePublisherMediaDevices", () => {
  it("loads camera and microphone devices", async () => {
    const mediaDevices = createMediaDevices([
      device("videoinput", "camera-1", "Front Camera"),
      device("audioinput", "mic-1", "Desk Mic"),
      device("audiooutput", "speaker-1", "Speaker"),
    ]);

    const { result } = renderHook(() => usePublisherMediaDevices(mediaDevices));

    await waitFor(() => expect(result.current.deviceStatus).toBe("loaded"));
    expect(result.current.videoInputs.map((item) => item.deviceId)).toEqual(["camera-1"]);
    expect(result.current.audioInputs.map((item) => item.deviceId)).toEqual(["mic-1"]);
  });

  it("refreshes the catalog when browser devicechange fires", async () => {
    const firstCatalog = [device("videoinput", "camera-1", "Front Camera")];
    const secondCatalog = [
      device("videoinput", "camera-1", "Front Camera"),
      device("videoinput", "camera-2", "Rear Camera"),
    ];
    const mediaDevices = createMediaDevices(firstCatalog, secondCatalog);
    const { result, unmount } = renderHook(() => usePublisherMediaDevices(mediaDevices));

    await waitFor(() => expect(result.current.videoInputs).toHaveLength(1));
    await act(async () => mediaDevices.dispatchDeviceChange());

    await waitFor(() => expect(result.current.videoInputs).toHaveLength(2));
    unmount();
    expect(mediaDevices.removeEventListener).toHaveBeenCalledWith("devicechange", expect.any(Function));
  });

  it("marks the catalog as unavailable or error when loading is not possible", async () => {
    const unsupported = renderHook(() => usePublisherMediaDevices({} as MediaDevices));
    await waitFor(() => expect(unsupported.result.current.deviceStatus).toBe("unavailable"));

    const failingDevices = createFailingMediaDevices();
    const failing = renderHook(() => usePublisherMediaDevices(failingDevices));
    await waitFor(() => expect(failing.result.current.deviceStatus).toBe("error"));
  });
});

type MediaDevicesMock = MediaDevices & {
  dispatchDeviceChange: () => Promise<void>;
  enumerateDevices: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};

function createMediaDevices(
  firstCatalog: MediaDeviceInfo[],
  secondCatalog = firstCatalog,
): MediaDevicesMock {
  let deviceChangeHandler: EventListener | null = null;
  const enumerateDevices = vi.fn()
    .mockResolvedValueOnce(firstCatalog)
    .mockResolvedValue(secondCatalog);
  return {
    addEventListener: vi.fn((_event: string, handler: EventListenerOrEventListenerObject) => {
      deviceChangeHandler = typeof handler === "function" ? handler : () => handler.handleEvent(new Event("devicechange"));
    }),
    dispatchDeviceChange: async () => {
      deviceChangeHandler?.(new Event("devicechange"));
    },
    enumerateDevices,
    removeEventListener: vi.fn(),
  } as unknown as MediaDevicesMock;
}

function createFailingMediaDevices(): MediaDevicesMock {
  return {
    addEventListener: vi.fn(),
    dispatchDeviceChange: async () => undefined,
    enumerateDevices: vi.fn(async () => {
      throw new Error("device failure");
    }),
    removeEventListener: vi.fn(),
  } as unknown as MediaDevicesMock;
}

function device(kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo {
  return {
    deviceId,
    groupId: "mock-group",
    kind,
    label,
    toJSON: () => ({ deviceId, groupId: "mock-group", kind, label }),
  };
}
