export type OperationalEventSeverity = "info" | "warn" | "error";
export type OperationalEventCategory = "api" | "signaling" | "network" | "stream" | "security";

export interface OperationalEvent {
  id: string;
  occurredAt: string;
  severity: OperationalEventSeverity;
  category: OperationalEventCategory;
  source: string;
  message: string;
  connections: number;
  latencyMs: number;
  throughputMbps: number;
}

export interface OperationalEventFilters {
  query: string;
  severity: "all" | OperationalEventSeverity;
  from: string;
  to: string;
}

export const DEFAULT_OPERATIONAL_EVENTS: OperationalEvent[] = [
  {
    id: "evt-001",
    occurredAt: "2026-06-01T09:00:00+09:00",
    severity: "info",
    category: "api",
    source: "API 서버",
    message: "헬스체크 정상",
    connections: 12,
    latencyMs: 42,
    throughputMbps: 18.4,
  },
  {
    id: "evt-002",
    occurredAt: "2026-06-01T09:05:00+09:00",
    severity: "info",
    category: "signaling",
    source: "Signaling 서버",
    message: "WebRTC WHEP 연결 수립",
    connections: 3,
    latencyMs: 88,
    throughputMbps: 42.1,
  },
  {
    id: "evt-003",
    occurredAt: "2026-06-01T09:12:00+09:00",
    severity: "warn",
    category: "network",
    source: "TURN 릴레이",
    message: "직접 ICE 후보 실패 후 릴레이 경로 사용",
    connections: 5,
    latencyMs: 164,
    throughputMbps: 31.6,
  },
  {
    id: "evt-004",
    occurredAt: "2026-06-01T09:24:00+09:00",
    severity: "warn",
    category: "stream",
    source: "Stream Registry",
    message: "송출 종료 감지",
    connections: 1,
    latencyMs: 110,
    throughputMbps: 0,
  },
  {
    id: "evt-005",
    occurredAt: "2026-06-01T09:31:00+09:00",
    severity: "error",
    category: "security",
    source: "인증/인가 서버",
    message: "만료된 세션으로 스트림 접근 거절",
    connections: 0,
    latencyMs: 73,
    throughputMbps: 0,
  },
];

export function filterOperationalEvents(
  events: OperationalEvent[],
  filters: OperationalEventFilters,
): OperationalEvent[] {
  const query = filters.query.trim().toLowerCase();
  const fromTime = filters.from ? new Date(filters.from).getTime() : null;
  const toTime = filters.to ? new Date(filters.to).getTime() : null;

  return events.filter((event) => {
    const occurredAt = new Date(event.occurredAt).getTime();
    const matchesQuery =
      !query ||
      event.message.toLowerCase().includes(query) ||
      event.source.toLowerCase().includes(query) ||
      event.category.toLowerCase().includes(query);
    const matchesSeverity = filters.severity === "all" || event.severity === filters.severity;
    const matchesFrom = fromTime === null || occurredAt >= fromTime;
    const matchesTo = toTime === null || occurredAt <= toTime;
    return matchesQuery && matchesSeverity && matchesFrom && matchesTo;
  });
}

export function summarizeOperationalEvents(events: OperationalEvent[]) {
  const connections = events.reduce((total, event) => total + event.connections, 0);
  const avgLatencyMs = events.length
    ? Math.round(events.reduce((total, event) => total + event.latencyMs, 0) / events.length)
    : 0;
  const peakThroughputMbps = events.reduce((peak, event) => Math.max(peak, event.throughputMbps), 0);
  const warnings = events.filter((event) => event.severity === "warn").length;
  const errors = events.filter((event) => event.severity === "error").length;
  return { connections, avgLatencyMs, peakThroughputMbps, warnings, errors };
}
