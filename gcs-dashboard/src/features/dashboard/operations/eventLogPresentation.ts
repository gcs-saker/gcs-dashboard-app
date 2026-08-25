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

export function formatOperationalEventMessage(message: string): string {
  return parseOperationalEventMessage(message).summary;
}

export function operationalEventContextRows(message: string): string[][] {
  const attributes = parseOperationalEventMessage(message).attributes;
  const rows: string[][] = [];
  const action = attributes.get("action");
  const viewerGroup = attributes.get("viewerGroup");
  const publisherGroup = attributes.get("publisherGroup");
  if (action) rows.push(["작업", OPERATION_LABELS[action] ?? action]);
  if (viewerGroup) rows.push(["요청 그룹", viewerGroup]);
  if (publisherGroup) rows.push(["송출 그룹", publisherGroup]);
  if (viewerGroup && publisherGroup) {
    rows.push(["접근 범위", viewerGroup === publisherGroup ? "동일 그룹" : "그룹 간 접근"]);
  }
  return rows;
}

function parseOperationalEventMessage(message: string) {
  const attributes = new Map<string, string>();
  const withoutAttributes = message.trim().replace(/\[([^\]]+)]/g, (_block, content: string) => {
    content.split(/,\s*/).forEach((entry) => {
      const separator = entry.indexOf("=");
      if (separator > 0) attributes.set(entry.slice(0, separator).trim(), entry.slice(separator + 1).trim());
    });
    return " ";
  });
  const summary = withoutAttributes
    .replace(/\bstream=redacted\b/gi, " ")
    .replace(/\(same group stream\)/gi, " ")
    .replace(/\s*:\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { attributes, summary: summary || "운영 이벤트" };
}

const OPERATION_LABELS: Readonly<Record<string, string>> = {
  view_stream: "스트림 조회",
  publish_stream: "스트림 송출",
  send_talkback: "음성 송신",
};
