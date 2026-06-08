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
