import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { monitorAudioStats } from "@streaming/hooks/audio/whepPlaybackAudio";

describe("monitorAudioStats", () => {
  afterEach(() => vi.useRealTimers());

  it("waits for the previous getStats call before scheduling the next one", async () => {
    vi.useFakeTimers();
    let resolveStats!: (report: RTCStatsReport) => void;
    const firstStats = new Promise<RTCStatsReport>((resolve) => { resolveStats = resolve; });
    const getStats = vi.fn()
      .mockReturnValueOnce(firstStats)
      .mockResolvedValue(new Map() as unknown as RTCStatsReport);
    const cleanup = monitorAudioStats({ getStats } as unknown as RTCPeerConnection, vi.fn());

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(getStats).toHaveBeenCalledTimes(1);

    resolveStats(new Map() as unknown as RTCStatsReport);
    await act(async () => { await Promise.resolve(); await vi.advanceTimersByTimeAsync(1_000); });
    expect(getStats).toHaveBeenCalledTimes(2);
    cleanup();
  });
});
