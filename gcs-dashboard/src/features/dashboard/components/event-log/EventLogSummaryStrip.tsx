import type { OperationalEventSummary } from "@dashboard/operations/operationalEvents";
import { EventLogMetricCard } from "./EventLogMetricCard";

interface EventLogSummaryStripProps {
  directCandidateCount: number;
  relayCount: number;
  streamSessionCount: number;
  summary: OperationalEventSummary;
  throughputLabel: string;
}

export function EventLogSummaryStrip({
  directCandidateCount,
  relayCount,
  streamSessionCount,
  summary,
  throughputLabel,
}: EventLogSummaryStripProps) {
  return (
    <div className="event-log-view__summary" aria-label="운영 지표 요약">
      <EventLogMetricCard label="연결 합계" value={summary.connections.toLocaleString("ko-KR")} tone="info" />
      <EventLogMetricCard label="평균 RTT" value={`${summary.avgLatencyMs} ms`} tone={summary.avgLatencyMs > 120 ? "warning" : "good"} />
      <EventLogMetricCard label={throughputLabel} value={`${summary.peakThroughputMbps.toFixed(1)} Mbps`} tone="info" />
      <EventLogMetricCard label="WARN" value={String(summary.warnings)} tone={summary.warnings > 0 ? "warning" : "muted"} />
      <EventLogMetricCard label="ERROR" value={String(summary.errors)} tone={summary.errors > 0 ? "danger" : "muted"} />
      <EventLogMetricCard label="TURN Relay" value={String(relayCount)} tone={relayCount > 0 ? "warning" : "good"} />
      <EventLogMetricCard label="Direct ICE" value={String(directCandidateCount)} tone="good" />
      <EventLogMetricCard label="Stream Sessions" value={String(streamSessionCount)} tone="info" />
    </div>
  );
}
