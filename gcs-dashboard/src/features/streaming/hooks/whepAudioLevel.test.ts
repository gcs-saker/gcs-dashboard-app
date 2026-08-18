import { describe, expect, test } from "vitest";

import { calculateAudioWaveform, calculateRmsAudioLevel, shouldEmitAudioLevel } from "./whepAudioLevel";

describe("whepAudioLevel", () => {
  test("normalizes silence to zero", () => {
    expect(calculateRmsAudioLevel([128, 128, 128, 128])).toBe(0);
    expect(calculateRmsAudioLevel([])).toBe(0);
  });

  test("calculates bounded RMS audio level for visible waveform rendering", () => {
    expect(calculateRmsAudioLevel([0, 255, 128, 128])).toBe(1);
    expect(calculateRmsAudioLevel([120, 136, 128, 128])).toBe(0.18);
  });

  test("downsamples actual PCM amplitudes into waveform bins", () => {
    const waveform = calculateAudioWaveform([128, 128, 160, 96, 255, 0, 128, 128], 4);

    expect(waveform).toEqual([0, 1, 1, 0]);
    expect(calculateAudioWaveform([], 3)).toEqual([0, 0, 0]);
  });

  test("filters tiny level changes to prevent noisy re-renders", () => {
    expect(shouldEmitAudioLevel(null, 0)).toBe(true);
    expect(shouldEmitAudioLevel(0.24, 0.245)).toBe(false);
    expect(shouldEmitAudioLevel(0.24, 0.27)).toBe(true);
    expect(shouldEmitAudioLevel(0.24, null)).toBe(true);
    expect(shouldEmitAudioLevel(null, null)).toBe(false);
  });
});
