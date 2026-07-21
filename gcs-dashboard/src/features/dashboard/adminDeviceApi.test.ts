import { describe, expect, test, vi } from "vitest";
import {
  activateRegisteredDevice,
  disableRegisteredDevice,
  fetchRegisteredDevices,
} from "./adminDeviceApi";

describe("adminDeviceApi", () => {
  test("fetches registered devices from the admin route", async () => {
    const fetcher = vi.fn(async () => jsonResponse([registeredDevice("pending")]));

    const devices = await fetchRegisteredDevices(fetcher);

    expect(devices).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/auth-policy/admin/devices",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  test("activates and disables registered devices through admin actions", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(registeredDevice("active")))
      .mockResolvedValueOnce(jsonResponse(registeredDevice("disabled")));

    await expect(activateRegisteredDevice("device/01", fetcher)).resolves.toMatchObject({ status: "active" });
    await expect(disableRegisteredDevice("device/01", fetcher)).resolves.toMatchObject({ status: "disabled" });

    expect(fetcher.mock.calls[0][0]).toBe("/auth-policy/admin/devices/device%2F01/activate");
    expect(fetcher.mock.calls[1][0]).toBe("/auth-policy/admin/devices/device%2F01/disable");
  });
});

function registeredDevice(status: string) {
  return {
    deviceUuid: "device-001",
    deviceType: "drone",
    displayName: "Daegu Drone 01",
    groupId: "co-a",
    sensors: [],
    status,
    streamPaths: [],
  };
}

function jsonResponse(payload: unknown): Response {
  return {
    json: async () => payload,
    ok: true,
    status: 200,
  } as Response;
}
