import {
  diagnoseOperationalEventAction,
  diagnoseOperationalEventCause,
  diagnoseOperationalEventImpact,
  EVENT_CATEGORY_LABELS,
  formatOperationalEventPayload,
} from "@dashboard/operations/eventLogPresentation";
import type { OperationalEvent, OperationalEventCategory } from "@dashboard/operations/operationalEvents";

interface EventLogDetailPanelProps {
  event: OperationalEvent | null;
  onCategoryFilterChange: (category: OperationalEventCategory) => void;
  onSourceFilterChange: (source: string) => void;
}

export function EventLogDetailPanel({ event, onCategoryFilterChange, onSourceFilterChange }: EventLogDetailPanelProps) {
  return (
    <aside className="event-log-view__detail" aria-label="이벤트 상세">
      <div className="event-log-view__panel-header">
        <h3>이벤트 상세</h3>
        {event ? <span className={`event-log-severity is-${event.severity}`}>{event.severity.toUpperCase()}</span> : null}
      </div>
      {event ? (
        <>
          <strong>{event.message}</strong>
          <div className="event-log-view__detail-actions">
            <button onClick={() => onSourceFilterChange(event.source)} type="button">이 서버만 보기</button>
            <button onClick={() => onCategoryFilterChange(event.category)} type="button">이 분류만 보기</button>
          </div>
          <EventLogDiagnosis event={event} />
          <EventLogDetailFields event={event} />
          <section className="event-log-view__raw" aria-label="운영 이벤트 원문">
            <span>운영 이벤트 원문</span>
            <pre>{formatOperationalEventPayload(event)}</pre>
          </section>
        </>
      ) : (
        <p>표시할 이벤트가 없습니다.</p>
      )}
    </aside>
  );
}

function EventLogDiagnosis({ event }: { event: OperationalEvent }) {
  return (
    <div className="event-log-view__diagnosis">
      <section><span>원인 후보</span><p>{diagnoseOperationalEventCause(event)}</p></section>
      <section><span>영향 범위</span><p>{diagnoseOperationalEventImpact(event)}</p></section>
      <section><span>권장 조치</span><p>{diagnoseOperationalEventAction(event)}</p></section>
    </div>
  );
}

function EventLogDetailFields({ event }: { event: OperationalEvent }) {
  const rows = [
    ["시간", new Date(event.occurredAt).toLocaleString("ko-KR")],
    ["출처", event.source],
    ["분류", EVENT_CATEGORY_LABELS[event.category]],
    ["이벤트 타입", event.eventType ?? "미지정"],
    ["서비스", event.sourceService ?? "미지정"],
    ["스트림", event.streamId ? "연결 스트림" : "미지정"],
    ["세션", event.connectionId ?? "미지정"],
    ["ICE 경로", event.icePath ?? "미지정"],
    ["Fallback", event.relayFallbackReason ?? "없음"],
    ["연결", String(event.connections)],
    ["RTT", `${event.latencyMs} ms`],
    ["처리량", `${event.throughputMbps.toFixed(1)} Mbps`],
  ];
  return (
    <dl>
      {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  );
}
