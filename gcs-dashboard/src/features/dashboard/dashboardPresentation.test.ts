import { describe, expect, it } from "vitest";
import {
  DASHBOARD_STREAM_MODE,
  DASHBOARD_STREAM_STATUS,
} from "@/features/stateContracts";
import {
  buildAudioWaveformBars,
  formatBearing,
  formatBearingDelta,
  formatPlaybackMode,
  getJitterTone,
  getLatencyTone,
  getPacketLossTone,
  telemetryRowsForStream,
} from "./dashboardPresentation";
import type { DashboardStreamSlot } from "./streamTypes";

const baseStream: DashboardStreamSlot = {
  detail: "전방 EO",
  id: "stream-1",
  mode: DASHBOARD_STREAM_MODE.eo,
  status: DASHBOARD_STREAM_STATUS.online,
  streamPath: "stream-1",
  title: "스트리밍 1",
};

describe("dashboardPresentation", () => {
  it("formats heading values with normalized degree text", () => {
    expect(formatBearing(-7)).toBe("353deg");
    expect(formatBearing(367)).toBe("007deg");
    expect(formatBearingDelta(7, 14)).toBe("-7deg");
  });

  it("builds waiting telemetry rows when stream geometry is missing", () => {
    expect(telemetryRowsForStream(baseStream)).toEqual([
      ["스트림", "전방 EO"],
      ["상태", "정상"],
      ["좌표", "대기"],
      ["고도", "대기"],
      ["방위", "대기"],
      ["좌표소스", "없음"],
    ]);
  });

  it("builds geometry telemetry rows from stream geometry", () => {
    const rows = telemetryRowsForStream({
      ...baseStream,
      geometry: {
        altitudeM: 13.25,
        fovDeg: 72,
        headingDeg: 372,
        lat: 35.871435,
        lng: 128.601445,
        pitchDeg: 1.24,
        rollDeg: -2.16,
        source: "telemetry",
        yawDeg: 7,
      },
    });

    expect(rows).toContainEqual(["위도", "35.871435"]);
    expect(rows).toContainEqual(["고도", "13.3 m"]);
    expect(rows).toContainEqual(["기체 방위", "012deg"]);
    expect(rows).toContainEqual(["방위 차이", "+5deg"]);
    expect(rows).toContainEqual(["좌표소스", "GPS 텔레메트리"]);
  });

  it("uses metric tone policies consistently", () => {
    expect(getLatencyTone(null)).toBe("muted");
    expect(getLatencyTone(450)).toBe("good");
    expect(getLatencyTone(901)).toBe("danger");
    expect(getJitterTone(80)).toBe("warning");
    expect(getPacketLossTone(0)).toBe("good");
    expect(getPacketLossTone(3)).toBe("warning");
    expect(getPacketLossTone(4)).toBe("danger");
  });

  it("builds deterministic quiet waveform bars and bounded active bars", () => {
    expect(buildAudioWaveformBars(null, false)).toEqual(Array.from({ length: 28 }, () => 4));

    const activeBars = buildAudioWaveformBars(0.5, true);

    expect(activeBars).toHaveLength(28);
    expect(Math.min(...activeBars)).toBeGreaterThanOrEqual(6);
    expect(Math.max(...activeBars)).toBeLessThanOrEqual(94);
  });

  it("formats playback mode labels for primary and fallback stream paths", () => {
    expect(formatPlaybackMode("webrtc", "online")).toBe("WebRTC");
    expect(formatPlaybackMode("hls", "fallback")).toBe("HLS fallback");
    expect(formatPlaybackMode("reconnecting", "reconnecting")).toBe("재연결");
    expect(formatPlaybackMode(null, "offline")).toBe("오프라인");
    expect(formatPlaybackMode(null, "online")).toBe("대기");
  });
});
