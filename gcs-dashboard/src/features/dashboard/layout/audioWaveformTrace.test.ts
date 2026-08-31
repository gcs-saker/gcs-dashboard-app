import { describe, expect, test } from "vitest";
import { buildAudioWaveformTrace } from "./audioWaveformTrace";

describe("buildAudioWaveformTrace", () => {
  test("maps chronological audio levels to a left-to-right trace", () => {
    expect(buildAudioWaveformTrace([4, 50, 100])).toBe("0,96 50,50 100,0");
  });

  test("bounds malformed amplitudes to the chart viewport", () => {
    expect(buildAudioWaveformTrace([-10, 140])).toBe("0,100 100,0");
    expect(buildAudioWaveformTrace([])).toBe("");
  });
});
