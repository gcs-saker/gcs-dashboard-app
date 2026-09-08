import { describe, expect, it, vi } from "vitest";
import { fetchAccessibleGroupInventory } from "@dashboard/assets/groupAssetApi";

describe("fetchAccessibleGroupInventory", () => {
  it("loads only devices returned by each accessible group endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/groups")) return Response.json([{ id: "team-a", name: "A팀", type: "team", parentId: null }]);
      return Response.json([{ deviceUuid: "device-a", groupId: "team-a", displayName: "드론 A", deviceType: "drone", status: "active", streamPaths: [] }]);
    });

    const inventory = await fetchAccessibleGroupInventory(fetcher);

    expect(inventory.groups).toHaveLength(1);
    expect(inventory.devices).toEqual([expect.objectContaining({ deviceUuid: "device-a", groupId: "team-a" })]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
