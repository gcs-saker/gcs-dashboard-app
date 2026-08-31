import { describe, expect, test } from "vitest";
import {
  isRegisteredDevice,
  isRegisteredDeviceList,
  pendingRegisteredDevices,
  type RegisteredDeviceStatus,
} from "@dashboard/devices/adminDevices";

describe("adminDevices", () => {
  test("validates registered device payloads and filters pending approvals", () => {
    const pending = registeredDevice("pending");
    const active = registeredDevice("active");

    expect(isRegisteredDevice(pending)).toBe(true);
    expect(isRegisteredDeviceList([pending, active])).toBe(true);
    expect(pendingRegisteredDevices([pending, active])).toEqual([pending]);
  });

  test("rejects malformed status values", () => {
    expect(isRegisteredDevice({ ...registeredDevice("pending"), status: "waiting" })).toBe(false);
  });
});

function registeredDevice(status: RegisteredDeviceStatus) {
  return {
    deviceUuid: `device-${status}`,
    deviceType: "drone",
    displayName: `Daegu ${status}`,
    groupId: "co-a",
    sensors: [],
    status,
    streamPaths: [],
  };
}
