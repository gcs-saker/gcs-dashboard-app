import { describe, expect, test } from "vitest";

import { buildWaveformPoints } from "./audioWaveformGeometry";

describe("buildWaveformPoints", () => {
  test("extends a sharp polyline from left to right without smoothing samples", () => {
    expect(buildWaveformPoints([0, 0.5, 1], 5)).toBe("0.00,50.00 250.00,73.00 500.00,4.00");
  });

  test("clamps malformed levels to the visible plot", () => {
    expect(buildWaveformPoints([-1, 2], 2)).toBe("0.00,50.00 1000.00,96.00");
    expect(buildWaveformPoints([], 2)).toBe("");
  });
});
