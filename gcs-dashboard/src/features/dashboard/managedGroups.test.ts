import { describe, expect, test } from "vitest";
import { isManagedGroup, isManagedGroupList } from "./managedGroups";

describe("managed group contracts", () => {
  const group = { id: "co-a", name: "A Company", type: "company", parentId: "bn-1", status: "active" };

  test("accepts active and inactive lifecycle states", () => {
    expect(isManagedGroup(group)).toBe(true);
    expect(isManagedGroup({ ...group, status: "inactive" })).toBe(true);
    expect(isManagedGroupList([group])).toBe(true);
  });

  test("rejects unknown hierarchy types and lifecycle states", () => {
    expect(isManagedGroup({ ...group, type: "division" })).toBe(false);
    expect(isManagedGroup({ ...group, status: "deleted" })).toBe(false);
  });
});
