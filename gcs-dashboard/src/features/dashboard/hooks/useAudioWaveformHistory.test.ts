import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useAudioWaveformHistory } from "./useAudioWaveformHistory";

describe("useAudioWaveformHistory", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("keeps a scrolling history and decays instead of resetting immediately", () => {
    const { result, rerender } = renderHook(
      ({ audioLevel, active }) => useAudioWaveformHistory({ audioLevel, isSignalPresent: active, sourceId: "stream-1", sampleCount: 6 }),
      { initialProps: { audioLevel: 0.8 as number | null, active: true } },
    );

    act(() => vi.advanceTimersByTime(360));
    const activeHistory = [...result.current];
    expect(activeHistory).toHaveLength(6);
    expect(activeHistory.some((sample) => sample > 4)).toBe(true);

    rerender({ audioLevel: null, active: false });
    act(() => vi.advanceTimersByTime(120));

    expect(result.current.some((sample) => sample > 4)).toBe(true);
    expect(result.current).not.toEqual(Array.from({ length: 6 }, () => 4));
  });

  test("starts a clean history when the selected source changes", () => {
    const { result, rerender } = renderHook(
      ({ sourceId }) => useAudioWaveformHistory({ audioLevel: 0.7, isSignalPresent: true, sourceId, sampleCount: 5 }),
      { initialProps: { sourceId: "stream-1" } },
    );

    act(() => vi.advanceTimersByTime(240));
    expect(result.current.some((sample) => sample > 4)).toBe(true);

    rerender({ sourceId: "stream-2" });
    expect(result.current).toEqual(Array.from({ length: 5 }, () => 4));
  });
});
