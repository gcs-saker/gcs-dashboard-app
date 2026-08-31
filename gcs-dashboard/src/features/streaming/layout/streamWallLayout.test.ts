import { describe, expect, it } from "vitest";
import type { StreamSlot as DashboardStreamSlot } from "@streaming/layout/streamModel";
import { reconcileStreamWallSlots } from "./streamWallLayout";

const streams = ["alpha", "bravo", "charlie", "delta", "echo"].map((id) => ({ id })) as DashboardStreamSlot[];

describe("reconcileStreamWallSlots", () => {
  it("fills a 2x2 wall with the first accessible streams", () => {
    expect(reconcileStreamWallSlots([], streams, "2x2")).toEqual(["alpha", "bravo", "charlie", "delta"]);
  });

  it("preserves valid assignments and replaces inaccessible streams", () => {
    expect(reconcileStreamWallSlots(["delta", "missing", null, "alpha"], streams, "2x2"))
      .toEqual(["delta", "bravo", "charlie", "alpha"]);
  });

  it("expands to nine slots without inventing stream identifiers", () => {
    expect(reconcileStreamWallSlots(["alpha"], streams, "3x3"))
      .toEqual(["alpha", "bravo", "charlie", "delta", "echo", null, null, null, null]);
  });
});
