import { describe, expect, test } from "vitest";
import { DASHBOARD_STREAM_MODE, DASHBOARD_STREAM_STATUS } from "@/features/stateContracts";
import { buildOpsSummaryViewModel } from "@dashboard/operations/opsSummaryViewModel";
import type { AudioAnalysisSnapshot } from "@dashboard/layout/dashboardPresentation";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";

const BASE_STREAM: DashboardStreamSlot = {
  detail: "전방 EO",
  id: "raw.mobile.front",
  mode: DASHBOARD_STREAM_MODE.eo,
  status: DASHBOARD_STREAM_STATUS.online,
  streamPath: "raw.mobile.front",
  title: "전방 카메라",
};

const BASE_AUDIO: AudioAnalysisSnapshot = {
  audioLevel: 0.4,
  firstFrameLatencyMs: 80,
  hasAudioTrack: true,
  iceRoundTripTimeMs: 30,
  iceTransportProtocol: "udp",
  isAudioActive: true,
  jitterMs: 24,
  localCandidateType: "srflx",
  mode: "webrtc",
  packetsLost: 0,
  relayFallbackReason: null,
  remoteCandidateType: "host",
  streamId: "raw.mobile.front",
  streamStatus: "online",
  title: "전방 카메라",
  whepResponseMs: 38,
};

describe("opsSummaryViewModel", () => {
  test("builds online stream operation summary from selected stream and audio state", () => {
    const viewModel = buildOpsSummaryViewModel({
      ...BASE_STREAM,
      aiModeEnabled: true,
      geometry: {
        altitudeM: 85.4,
        batteryPercent: 79,
        fovDeg: 72,
        headingDeg: 325,
        lat: 36.11995,
        lng: 128.36337,
        pitchDeg: 43.8,
        rollDeg: 18.9,
        source: "telemetry",
        yawDeg: 194,
      },
    }, BASE_AUDIO, 4, 2);

    expect(viewModel.missionText).toBe("실시간 운용 가능");
    expect(viewModel.missionTone).toBe("good");
    expect(viewModel.focusTitle).toBe("36.119950, 128.363370");
    expect(viewModel.focusDetail).toContain("배터리 79%");
    expect(viewModel.telemetryTiles).toEqual([
      { label: "좌표", value: "36.119950, 128.363370", tone: "good" },
      { label: "고도", value: "85.4 m", tone: "info" },
      { label: "배터리", value: "79%", tone: "good" },
      { label: "자세", value: "R 18.9° · P 43.8° · Y 194°", tone: "info" },
    ]);
    expect(viewModel.statusTiles).toContainEqual({ label: "오디오", value: "음성 수신", tone: "good" });
    expect(viewModel.statusNotes.map((note) => note.label)).toContain("ICE srflx->host/UDP");
    expect(viewModel.recentEvents.map((event) => event.label)).toContain("재생 경로 WebRTC");
  });

  test("builds offline stream summary without audio or GPS assumptions", () => {
    const viewModel = buildOpsSummaryViewModel({
      ...BASE_STREAM,
      status: DASHBOARD_STREAM_STATUS.offline,
    }, null, 0, 0);

    expect(viewModel.missionText).toBe("송출 대기");
    expect(viewModel.missionTone).toBe("danger");
    expect(viewModel.focusTitle).toBe("좌표 대기");
    expect(viewModel.statusTiles).toContainEqual({ label: "GPS", value: "좌표 대기", tone: "muted" });
    expect(viewModel.telemetryTiles.every((tile) => tile.value === "대기")).toBe(true);
    expect(viewModel.statusNotes.map((note) => note.label)).toContain("음성 분석 대기");
  });
});
