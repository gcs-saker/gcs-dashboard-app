import { describe, expect, test } from "vitest";
import { coordinateFromMapPercent, formatCoordinate, projectCoordinate } from "./tacticalMapGeometry";

describe("tacticalMapGeometry", () => {
  test("projects and restores a coordinate around the selected center", () => {
    const center = { lat: 35.871435, lng: 128.601445 };
    const coordinate = { lat: 35.872235, lng: 128.602245 };
    const point = projectCoordinate(coordinate, center, 3);

    expect(point.left).toBeGreaterThan(50);
    expect(point.top).toBeLessThan(50);
    expect(coordinateFromMapPercent(point, center, 3)).toEqual({
      lat: expect.closeTo(coordinate.lat, 6),
      lng: expect.closeTo(coordinate.lng, 6),
    });
  });

  test("formats operation coordinates consistently", () => {
    expect(formatCoordinate({ lat: 35.1, lng: 128.2 })).toBe("35.100000, 128.200000");
  });
});
