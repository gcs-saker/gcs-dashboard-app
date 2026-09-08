import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useAudioWaveformHistory } from "./useAudioWaveformHistory";

describe("useAudioWaveformHistory", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("records received levels in order and retains them when reception stops", () => {
    const { result, rerender } = renderHook(
      ({ audioLevel, active }) => useAudioWaveformHistory({ audioLevel, isSignalPresent: active, sourceId: "stream-1", sampleCount: 6 }),
      { initialProps: { audioLevel: 0.8 as number | null, active: true } },
    );

    act(() => vi.advanceTimersByTime(360));
    const activeHistory = [...result.current];
    expect(activeHistory).toEqual([0.8, 0.8, 0.8]);

    rerender({ audioLevel: null, active: false });
    act(() => vi.advanceTimersByTime(120));

    expect(result.current).toEqual(activeHistory);
  });

  test("starts a clean history when the selected source changes", () => {
    const { result, rerender } = renderHook(
      ({ sourceId }) => useAudioWaveformHistory({ audioLevel: 0.7, isSignalPresent: true, sourceId, sampleCount: 5 }),
      { initialProps: { sourceId: "stream-1" } },
    );

    act(() => vi.advanceTimersByTime(240));
    expect(result.current).toEqual([0.7, 0.7]);

    rerender({ sourceId: "stream-2" });
    expect(result.current).toEqual([]);
  });

  test("does not fabricate samples when an audio track has no measurable level", () => {
    const { result } = renderHook(() => useAudioWaveformHistory({
      audioLevel: null,
      isSignalPresent: true,
      sourceId: "stream-1",
      sampleCount: 6,
    }));

    act(() => vi.advanceTimersByTime(360));
    expect(result.current).toEqual([]);
  });

  test("normalizes invalid sample counts to a safe bounded history", () => {
    const { result, rerender } = renderHook(
      ({ sampleCount }) => useAudioWaveformHistory({ audioLevel: null, isSignalPresent: false, sourceId: "stream-1", sampleCount }),
      { initialProps: { sampleCount: 0 } },
    );

    expect(result.current).toEqual([]);
    rerender({ sampleCount: Number.NaN });
    expect(result.current).toEqual([]);
  });

  test("keeps a bounded recording after the visible sample capacity is reached", () => {
    const { result } = renderHook(() => useAudioWaveformHistory({
      audioLevel: 0.4,
      isSignalPresent: true,
      sourceId: "stream-1",
      sampleCount: 3,
    }));

    act(() => vi.advanceTimersByTime(480));
    expect(result.current).toEqual([0.4, 0.4, 0.4]);
  });
});
