import { DASHBOARD_GEOMETRY_SOURCE, DASHBOARD_SERVER_HEALTH, DASHBOARD_STREAM_MODE, DASHBOARD_STREAM_STATUS } from "@/features/stateContracts";
import type { AudioAnalysisSnapshot } from "@dashboard/dashboardPresentation";
import type { SystemServiceCard } from "@dashboard/systemStatusViewModel";
import type { DashboardStreamSlot } from "@dashboard/streamTypes";
import { MOCK_OPERATIONAL_EVENTS } from "@mocks/fixtures";

export const STORY_STREAM_SLOTS = Object.freeze({
  idle: createStoryStream("story-idle", "스트리밍 대기", DASHBOARD_STREAM_STATUS.offline, null),
  live: createStoryStream("story-live", "DRN-01 전방 EO", DASHBOARD_STREAM_STATUS.online, "raw.sample.front"),
  reconnecting: createStoryStream("story-reconnecting", "UGV-02 열화상", DASHBOARD_STREAM_STATUS.reconnecting, "raw.ugv.ir"),
  error: createStoryStream("story-error", "SEN-04 장애", DASHBOARD_STREAM_STATUS.error, "raw.sensor.error"),
  fallback: createStoryStream("story-fallback", "DRN-03 HLS", DASHBOARD_STREAM_STATUS.fallback, "raw.drone.hls"),
} as const);

export const STORY_STREAM_LIST = Object.freeze(Object.values(STORY_STREAM_SLOTS));

export const STORY_SERVICE_CARDS: SystemServiceCard[] = [
  ["API", "REST / Health / Stream Registry", DASHBOARD_SERVER_HEALTH.online],
  ["Auth", "세션 / 권한 / CSRF", DASHBOARD_SERVER_HEALTH.online],
  ["Signaling", "WHIP / WHEP / ICE", DASHBOARD_SERVER_HEALTH.degraded],
  ["Streams", "Media path / Registry", DASHBOARD_SERVER_HEALTH.error],
  ["Ready", "통합 readiness", DASHBOARD_SERVER_HEALTH.degraded],
];

export const STORY_AUDIO_ANALYSIS: AudioAnalysisSnapshot = Object.freeze({
  streamId: STORY_STREAM_SLOTS.live.id,
  title: STORY_STREAM_SLOTS.live.title,
  mode: "webrtc",
  streamStatus: "online",
  hasAudioTrack: true,
  isAudioActive: true,
  audioLevel: 0.42,
  firstFrameLatencyMs: 126,
  whepResponseMs: 42,
  jitterMs: 18,
  packetsLost: 0,
  iceRoundTripTimeMs: 38,
  localCandidateType: "srflx",
  remoteCandidateType: "host",
  iceTransportProtocol: "udp",
  relayFallbackReason: null,
});

export const STORY_OPERATIONAL_EVENTS = Object.freeze([
  ...MOCK_OPERATIONAL_EVENTS,
  {
    ...MOCK_OPERATIONAL_EVENTS[1],
    id: "story-event-error",
    severity: "error",
    eventType: "stream.disconnect",
    source: "MediaMTX",
    message: "WHEP 세션이 비정상 종료되어 재연결 대기 상태로 전환했습니다.",
    latencyMs: 980,
    throughputMbps: 0,
  },
] as const);

function createStoryStream(
  id: string,
  title: string,
  status: DashboardStreamSlot["status"],
  streamPath: string | null,
): DashboardStreamSlot {
  return {
    id,
    title,
    status,
    mode: status === DASHBOARD_STREAM_STATUS.fallback ? DASHBOARD_STREAM_MODE.ir : DASHBOARD_STREAM_MODE.eo,
    detail: streamPath ? `${title} / ${streamPath}` : "주소 대기",
    aiModeEnabled: status === DASHBOARD_STREAM_STATUS.online,
    connectedDeviceId: streamPath ? title.split(" ")[0] : null,
    sourceUrl: streamPath ? `/webrtc/${streamPath}/whep` : null,
    streamPath,
    geometry: {
      lat: 35.871435,
      lng: 128.601445,
      altitudeM: 120,
      headingDeg: 7,
      pitchDeg: -2,
      rollDeg: 1,
      yawDeg: 7,
      fovDeg: 62,
      source: DASHBOARD_GEOMETRY_SOURCE.telemetry,
    },
  };
}
