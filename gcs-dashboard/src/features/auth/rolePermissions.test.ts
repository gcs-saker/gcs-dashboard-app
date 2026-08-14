import { describe, expect, test } from "vitest";
import { canManageDeviceProvisioning } from "./rolePermissions";

describe("rolePermissions", () => {
  test("allows system and group administrators to manage exact-group provisioning", () => {
    expect(canManageDeviceProvisioning("admin")).toBe(true);
    expect(canManageDeviceProvisioning("group_admin")).toBe(true);
    expect(canManageDeviceProvisioning("operator")).toBe(false);
    expect(canManageDeviceProvisioning("viewer")).toBe(false);
  });
});
