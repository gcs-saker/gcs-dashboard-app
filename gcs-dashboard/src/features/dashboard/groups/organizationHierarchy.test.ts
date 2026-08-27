import { describe, expect, test } from "vitest";
import { flattenGroupHierarchy, groupTypeLabel } from "./organizationHierarchy";

describe("organizationHierarchy", () => {
  test("flattens parent and child groups with stable depths", () => {
    const groups = [
      { id: "co-a", name: "A Company", type: "company" as const, parentId: "bn-1", status: "active" as const },
      { id: "bn-1", name: "1 Battalion", type: "battalion" as const, parentId: null, status: "active" as const },
      { id: "plt-a", name: "A Platoon", type: "platoon" as const, parentId: "co-a", status: "inactive" as const },
    ];

    expect(flattenGroupHierarchy(groups).map(({ id, depth }) => ({ id, depth }))).toEqual([
      { id: "bn-1", depth: 0 }, { id: "co-a", depth: 1 }, { id: "plt-a", depth: 2 },
    ]);
    expect(groupTypeLabel("platoon")).toBe("소대");
  });
});
