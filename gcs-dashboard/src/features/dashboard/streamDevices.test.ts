import { describe, expect, test } from "vitest";
import { DEFAULT_DASHBOARD_STREAMS } from "./streamTypes";
import { connectDeviceToStreamSlot, disconnectStreamSlot, MOCK_STREAM_DEVICES } from "./streamDevices";

describe("streamDevices", () => {
  test("connects a registry device to a stream slot", () => {
    const connected = connectDeviceToStreamSlot(DEFAULT_DASHBOARD_STREAMS[3], MOCK_STREAM_DEVICES[0]);

    expect(connected.connectedDeviceId).toBe("device-drn-01-front");
    expect(connected.streamPath).toBe("raw.sample.front");
    expect(connected.status).toBe("online");
    expect(connected.detail).toBe("DRN-01 전방 EO / raw.sample.front");
    expect(connected.geometry?.fovDeg).toBe(72);
  });

  test("disconnects a stream slot without removing the slot itself", () => {
    const connected = connectDeviceToStreamSlot(DEFAULT_DASHBOARD_STREAMS[3], MOCK_STREAM_DEVICES[0]);
    const disconnected = disconnectStreamSlot(connected);

    expect(disconnected.id).toBe(DEFAULT_DASHBOARD_STREAMS[3].id);
    expect(disconnected.connectedDeviceId).toBeNull();
    expect(disconnected.streamPath).toBeNull();
    expect(disconnected.geometry).toBeNull();
    expect(disconnected.status).toBe("offline");
  });
});
