import { describe, expect, test } from "vitest";
import { collectAssetTreeNodes, DEFAULT_ASSET_TREE } from "./assetTree";

describe("assetTree", () => {
  test("keeps assets in a hierarchical tree", () => {
    const nodes = collectAssetTreeNodes(DEFAULT_ASSET_TREE);

    expect(nodes.map((node) => node.id)).toContain("raw.sample.front");
    expect(nodes.find((node) => node.id === "DRN-01")?.children?.[0].id).toBe("raw.sample.front");
  });
});
