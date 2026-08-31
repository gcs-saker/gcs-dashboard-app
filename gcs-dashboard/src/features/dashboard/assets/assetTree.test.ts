import { describe, expect, test } from "vitest";
import { collectAssetTreeNodes, DEFAULT_ASSET_TREE, mergeAssetTreeWithStreams } from "@dashboard/assets/assetTree";
import { buildAccessibleAssetTree } from "@dashboard/assets/groupAssetTree";

describe("assetTree", () => {
  test("keeps the production fallback tree empty until discovery", () => {
    const nodes = collectAssetTreeNodes(DEFAULT_ASSET_TREE);

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ id: "accessible-assets", children: [], status: "offline" });
  });

  test("adds newly discovered stream paths without duplicating known tree nodes", () => {
    const merged = mergeAssetTreeWithStreams(DEFAULT_ASSET_TREE, [
      { streamPath: "raw.sample.front", detail: "Known / raw.sample.front", status: "online" },
      { streamPath: "raw.mobile.webcam", detail: "Phone Camera / raw.mobile.webcam", status: "online" },
    ]);
    const nodes = collectAssetTreeNodes(merged);

    expect(nodes.filter((node) => node.id === "raw.sample.front")).toHaveLength(1);
    expect(nodes.find((node) => node.id === "raw.mobile.webcam")).toMatchObject({
      label: "Phone Camera",
      status: "online",
    });
  });

  test("maps discovered stream statuses without a static asset fixture", () => {
    const merged = mergeAssetTreeWithStreams(DEFAULT_ASSET_TREE, [
      { streamPath: "raw.sample.front", detail: "Known / raw.sample.front", status: "offline" },
      { streamPath: "raw.sample.thermal", detail: "Thermal / raw.sample.thermal", status: "reconnecting" },
    ]);
    const nodes = collectAssetTreeNodes(merged);

    expect(nodes.find((node) => node.id === "raw.sample.front")).toMatchObject({
      status: "offline",
    });
    expect(nodes.find((node) => node.id === "raw.sample.thermal")).toMatchObject({
      status: "warning",
    });
    expect(nodes.find((node) => node.id === "group-discovered-streams")?.status).toBe("warning");
  });

  test("builds the tree from accessible groups and includes devices without live streams", () => {
    const tree = buildAccessibleAssetTree({
      groups: [
        { id: "root", name: "운영본부", type: "organization", parentId: null },
        { id: "team-a", name: "A팀", type: "team", parentId: "root" },
      ],
      devices: [
        { deviceUuid: "device-live", groupId: "team-a", displayName: "현장 드론", deviceType: "drone", status: "active", streamPaths: ["raw.device-live.front"] },
        { deviceUuid: "device-idle", groupId: "team-a", displayName: "대기 로봇", deviceType: "robot", status: "active", streamPaths: [] },
      ],
    }, [{ streamPath: "raw.device-live.front", detail: "전방 카메라 / raw.device-live.front", status: "online" }], {
      "device-live": "개인 드론",
    });
    const nodes = collectAssetTreeNodes(tree);

    expect(nodes.find((node) => node.id === "device-live")).toMatchObject({ label: "개인 드론", detail: "drone", status: "online" });
    expect(nodes.find((node) => node.id === "device-idle")).toMatchObject({ label: "대기 로봇", detail: "robot", status: "online" });
    expect(nodes.find((node) => node.id === "raw.device-live.front")).toBeUndefined();
  });
});
