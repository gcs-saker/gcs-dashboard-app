import {
  serverHealthText,
  type DashboardServerStatusSnapshot,
} from "./serverStatus";
import {
  buildRttChart,
  buildRttStats,
  rttMaxLatency,
  type RttChart,
  type RttSample,
  type RttStats,
} from "./systemStatusRtt";
import { DASHBOARD_SERVER_HEALTH, type DashboardServerHealth } from "@/features/stateContracts";

export type SystemStatusRow = readonly [label: string, value: string, health: DashboardServerHealth];
export type SystemServiceCard = readonly [name: string, description: string, health: DashboardServerHealth];
export type SystemImpactItem = readonly [name: string, health: DashboardServerHealth, description: string];

export interface SystemStatusViewModel {
  checkedText: string;
  impactItems: SystemImpactItem[];
  latestRttText: string;
  primaryRows: SystemStatusRow[];
  readinessText: string;
  rttChart: RttChart;
  rttMax: number;
  rttStats: RttStats;
  serviceCards: SystemServiceCard[];
}

export function buildSystemStatusViewModel(
  status: DashboardServerStatusSnapshot,
  rttHistory: readonly RttSample[],
): SystemStatusViewModel {
  const samples = [...rttHistory];
  const rttMax = rttMaxLatency(samples);
  return {
    checkedText: formatCheckedAt(status.checkedAt),
    impactItems: buildImpactItems(status),
    latestRttText: status.latencyMs ? `${status.latencyMs} ms` : "측정 대기",
    primaryRows: buildPrimaryRows(status),
    readinessText: serverHealthText(status.readiness),
    rttChart: buildRttChart(samples, rttMax),
    rttMax,
    rttStats: buildRttStats(samples),
    serviceCards: buildServiceCards(status),
  };
}

function buildPrimaryRows(status: DashboardServerStatusSnapshot): SystemStatusRow[] {
  return [
    ["API 서버", serverHealthText(status.apiServer), status.apiServer],
    ["인증/인가 서버", serverHealthText(status.authServer), status.authServer],
    ["Signaling 서버", serverHealthText(status.signalingServer), status.signalingServer],
    ["스트림 Registry", serverHealthText(status.streams), status.streams],
    ["네트워크 RTT", status.latencyMs ? `${status.latencyMs} ms` : "측정 대기", status.readiness],
    ["통합 헬스체크", serverHealthText(status.readiness), status.readiness],
  ];
}

function buildServiceCards(status: DashboardServerStatusSnapshot): SystemServiceCard[] {
  return [
    ["API", "REST / Health / Stream Registry", status.apiServer],
    ["Auth", "세션 / 권한 / CSRF", status.authServer],
    ["Signaling", "WHIP / WHEP / ICE", status.signalingServer],
    ["Streams", "Media path / Registry", status.streams],
    ["Ready", "통합 readiness", status.readiness],
  ];
}

function buildImpactItems(status: DashboardServerStatusSnapshot): SystemImpactItem[] {
  return [
    ["API", status.apiServer, status.apiServer === DASHBOARD_SERVER_HEALTH.online ? "조회/제어 정상" : "대시보드 데이터 지연 가능"],
    ["Auth", status.authServer, status.authServer === DASHBOARD_SERVER_HEALTH.online ? "세션 확인 정상" : "로그인/토큰 갱신 영향"],
    ["Signaling", status.signalingServer, status.signalingServer === DASHBOARD_SERVER_HEALTH.online ? "WHIP/WHEP 정상" : "신규 스트림 연결 영향"],
    ["Streams", status.streams, status.streams === DASHBOARD_SERVER_HEALTH.online ? "Registry 정상" : "스트림 목록/상태 반영 지연"],
  ];
}

function formatCheckedAt(checkedAt: number | null): string {
  return checkedAt
    ? new Date(checkedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "대기";
}
