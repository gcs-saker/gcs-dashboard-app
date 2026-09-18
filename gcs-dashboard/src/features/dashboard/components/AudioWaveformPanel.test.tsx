import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { DASHBOARD_STREAM_MODE, DASHBOARD_STREAM_STATUS } from "@/features/stateContracts";
import type { AudioAnalysisSnapshot } from "@dashboard/layout/dashboardPresentation";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import { AudioWaveformPanel } from "./AudioWaveformPanel";

const selectedStream: DashboardStreamSlot = {
  detail: "front",
  id: "stream-1",
  mode: DASHBOARD_STREAM_MODE.eo,
  status: DASHBOARD_STREAM_STATUS.online,
  streamPath: "raw/device/front",
  title: "Front EO",
};

const analysis: AudioAnalysisSnapshot = {
  streamId: selectedStream.id,
  title: selectedStream.title,
  mode: "webrtc",
  streamStatus: "online",
  hasAudioTrack: true,
  isAudioActive: true,
  audioLevel: 0.65,
  firstFrameLatencyMs: 155,
  whepResponseMs: 29,
  jitterMs: 3,
  packetsLost: 0,
  iceRoundTripTimeMs: 18,
  localCandidateType: "host",
  remoteCandidateType: "host",
  iceTransportProtocol: "udp",
  relayFallbackReason: null,
};

describe("AudioWaveformPanel", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("records only the selected stream remote audio level as waveform history", () => {
    const { container, rerender } = render(
      <AudioWaveformPanel analysis={analysis} selectedStream={selectedStream} />,
    );

    act(() => vi.advanceTimersByTime(240));

    expect(screen.getByText("수신 중")).toBeInTheDocument();
    expect(screen.getByText("65%")).toBeInTheDocument();
    expect(container.querySelector(".audio-waveform__line")?.getAttribute("points")?.split(" ")).toHaveLength(2);

    const otherStream = { ...selectedStream, id: "stream-2", title: "Rear EO" };
    rerender(<AudioWaveformPanel analysis={analysis} selectedStream={otherStream} />);

    expect(screen.getByText("신호 대기")).toBeInTheDocument();
    expect(screen.getAllByText("대기").length).toBeGreaterThan(0);
    expect(container.querySelector(".audio-waveform__line")).toBeNull();
  });
});
