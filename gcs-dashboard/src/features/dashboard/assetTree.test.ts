import { describe, expect, test } from "vitest";
import { collectAssetTreeNodes, DEFAULT_ASSET_TREE, mergeAssetTreeWithStreams } from "./assetTree";

describe("assetTree", () => {
  test("keeps assets in a hierarchical tree", () => {
    const nodes = collectAssetTreeNodes(DEFAULT_ASSET_TREE);

    expect(nodes.map((node) => node.id)).toContain("raw.sample.front");
    expect(nodes.find((node) => node.id === "DRN-01")?.children?.[0].id).toBe("raw.sample.front");
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
});
