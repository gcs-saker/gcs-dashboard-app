import { describe, expect, test } from "vitest";
import { DASHBOARD_STREAM_MODE, DASHBOARD_STREAM_STATUS } from "@/features/stateContracts";
import { buildOpsSummaryViewModel } from "./opsSummaryViewModel";
import type { AudioAnalysisSnapshot } from "./dashboardPresentation";
import type { DashboardStreamSlot } from "./streamTypes";

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
        altitudeM: 34.2,
        fovDeg: 72,
        headingDeg: 7,
        lat: 35.87143,
        lng: 128.60144,
        pitchDeg: 0,
        rollDeg: 0,
        source: "telemetry",
        yawDeg: 7,
      },
    }, BASE_AUDIO, 4, 2);

    expect(viewModel.missionText).toBe("실시간 운용 가능");
    expect(viewModel.missionTone).toBe("good");
    expect(viewModel.focusTitle).toBe("35.87143, 128.60144");
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
    expect(viewModel.statusNotes.map((note) => note.label)).toContain("음성 분석 대기");
  });
});
