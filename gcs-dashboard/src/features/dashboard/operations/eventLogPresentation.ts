import type { OperationalEvent, OperationalEventCategory } from "@dashboard/operations/operationalEvents";

export const EVENT_SEVERITY_LABELS = {
  all: "전체",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
} as const;

export const EVENT_CATEGORY_LABELS: Record<OperationalEventCategory, string> = {
  api: "API",
  signaling: "Signaling",
  network: "Network",
  stream: "Stream",
  security: "Security",
};

export const EVENT_CATEGORIES: readonly OperationalEventCategory[] = [
  "api",
  "signaling",
  "network",
  "stream",
  "security",
] as const;

export interface EventCategorySummary {
  category: OperationalEventCategory;
  count: number;
}

export function summarizeEventCategories(events: readonly OperationalEvent[]): EventCategorySummary[] {
  const counts = new Map<OperationalEventCategory, number>(EVENT_CATEGORIES.map((category) => [category, 0]));
  for (const event of events) {
    counts.set(event.category, (counts.get(event.category) ?? 0) + 1);
  }
  return EVENT_CATEGORIES.map((category) => ({ category, count: counts.get(category) ?? 0 }));
}

export function diagnoseOperationalEventCause(event: OperationalEvent): string {
  if (event.category === "security") return "세션 만료, 권한 정책, 토큰 갱신 실패 가능성이 큽니다.";
  if (event.category === "network") return "NAT 경로, TURN fallback, 네트워크 지연 또는 패킷 손실을 우선 확인해야 합니다.";
  if (event.category === "signaling") return "WHEP/WHIP signaling 응답, ICE 후보 수집, 인증 헤더 누락 가능성을 확인해야 합니다.";
  if (event.category === "stream") return "송출 장치 상태, MediaMTX path, 코덱/트랙 상태를 점검해야 합니다.";
  return "API health, ready 상태, DB/Redis 의존 서비스 응답을 확인해야 합니다.";
}

export function diagnoseOperationalEventImpact(event: OperationalEvent): string {
  if (event.severity === "error") return "사용자 기능 실패 또는 스트림 접근 실패로 이어질 수 있습니다.";
  if (event.severity === "warn") return "서비스는 유지되지만 지연, fallback, 일부 기능 저하가 발생할 수 있습니다.";
  return "현재는 참고 이벤트이며 운영 추세 확인에 사용합니다.";
}

export function diagnoseOperationalEventAction(event: OperationalEvent): string {
  if (event.category === "security") return "사용자 세션 상태와 인증 서버 로그를 확인하고 필요 시 재로그인을 안내합니다.";
  if (event.category === "network") return "ICE 후보 유형, TURN 사용률, RTT 변화를 확인하고 포트/방화벽 정책을 점검합니다.";
  if (event.category === "signaling") return "signaling 서버 health와 WHEP/WHIP route 응답 코드를 확인합니다.";
  if (event.category === "stream") return "송출자 상태, stream path, MediaMTX 로그를 확인합니다.";
  return "해당 서비스 health와 최근 배포/재시작 이력을 확인합니다.";
}

export function formatOperationalEventPayload(event: OperationalEvent): string {
  return [
    `id=${event.id}`,
    `occurredAt=${event.occurredAt}`,
    `severity=${event.severity}`,
    `category=${event.category}`,
    `eventType=${event.eventType ?? ""}`,
    `sourceService=${event.sourceService ?? ""}`,
    `source=${event.source}`,
    `message=${event.message}`,
    `stream=${event.streamId ? "connected" : "none"}`,
    `connectionId=${event.connectionId ?? ""}`,
    `icePath=${event.icePath ?? ""}`,
    `relayFallbackReason=${event.relayFallbackReason ?? ""}`,
    `connections=${event.connections}`,
    `latencyMs=${event.latencyMs}`,
    `throughputMbps=${event.throughputMbps.toFixed(1)}`,
  ].join("\n");
}
