import { describe, expect, test } from "vitest";
import { getMapFocusForStream } from "./mapFocus";
import { DEFAULT_DASHBOARD_STREAMS } from "./streamTypes";

describe("mapFocus", () => {
  test("builds map focus and FOV view data from stream geometry", () => {
    const focus = getMapFocusForStream(DEFAULT_DASHBOARD_STREAMS[0]);

    expect(focus.hasGeometry).toBe(true);
    expect(focus.label).toContain("기본 좌표");
    expect(focus.label).toContain("FOV 72deg");
    expect(focus.coneStyle.transform).toBe("rotate(130deg)");
  });

  test("returns a safe fallback when geometry is missing", () => {
    const focus = getMapFocusForStream({
      ...DEFAULT_DASHBOARD_STREAMS[0],
      geometry: null,
    });

    expect(focus.hasGeometry).toBe(false);
    expect(focus.label).toBe("스트리밍 1 focus 대기");
    expect(focus.markerStyle).toEqual({ left: "50%", top: "50%" });
  });
});
