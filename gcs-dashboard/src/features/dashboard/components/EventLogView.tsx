import { useMemo, useState } from "react";
import {
  summarizeOperationalEvents,
  type OperationalEventFilters,
} from "../operationalEvents";
import { useOperationalEvents } from "../hooks/useOperationalEvents";

const severityLabels = {
  all: "전체",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
} as const;

export function EventLogView() {
  const [filters, setFilters] = useState<OperationalEventFilters>({
    query: "",
    severity: "all",
    from: "",
    to: "",
  });
  const { events, errorMessage, isLoading, lastUpdatedAt } = useOperationalEvents(filters);
  const summary = useMemo(() => summarizeOperationalEvents(events), [events]);
  const peakThroughput = Math.max(1, summary.peakThroughputMbps);

  return (
    <section className="event-log-view" aria-label="이벤트로그">
      <div className="event-log-view__filters">
        <label>
          <span>내용</span>
          <input
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
            placeholder="검색"
            value={filters.query}
          />
        </label>
        <label>
          <span>강도</span>
          <select
            onChange={(event) =>
              setFilters((current) => ({ ...current, severity: event.target.value as OperationalEventFilters["severity"] }))
            }
            value={filters.severity}
          >
            {Object.entries(severityLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>시작</span>
          <input
            onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
            type="datetime-local"
            value={filters.from}
          />
        </label>
        <label>
          <span>종료</span>
          <input
            onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
            type="datetime-local"
            value={filters.to}
          />
        </label>
      </div>

      <div className="event-log-view__summary" aria-label="운영 지표 요약">
        <span>Connections {summary.connections}</span>
        <span>RTT {summary.avgLatencyMs} ms</span>
        <span>Peak {summary.peakThroughputMbps.toFixed(1)} Mbps</span>
        <span>WARN {summary.warnings}</span>
        <span>ERROR {summary.errors}</span>
        {isLoading ? <span role="status">이벤트 갱신 중</span> : null}
        {lastUpdatedAt ? <span>{new Date(lastUpdatedAt).toLocaleTimeString("ko-KR")} 갱신</span> : null}
      </div>

      {errorMessage ? <p className="event-log-view__error" role="alert">{errorMessage}</p> : null}

      <div className="event-log-view__chart" aria-label="시간대별 네트워크 지표">
        {events.map((event) => (
          <div className="event-log-view__bar" key={event.id}>
            <span>{new Date(event.occurredAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>
            <i style={{ height: `${Math.max(6, (event.throughputMbps / peakThroughput) * 100)}%` }} />
            <small>{event.connections}</small>
          </div>
        ))}
      </div>

      <div className="event-log-view__table" role="table" aria-label="운영 이벤트 목록">
        <div role="row">
          <span role="columnheader">시간</span>
          <span role="columnheader">강도</span>
          <span role="columnheader">서버</span>
          <span role="columnheader">내용</span>
          <span role="columnheader">RTT</span>
          <span role="columnheader">연결</span>
        </div>
        {events.map((event) => (
          <div className={`is-${event.severity}`} key={event.id} role="row">
            <span role="cell">{new Date(event.occurredAt).toLocaleString("ko-KR")}</span>
            <span role="cell">{event.severity.toUpperCase()}</span>
            <span role="cell">{event.source}</span>
            <span role="cell">{event.message}</span>
            <span role="cell">{event.latencyMs} ms</span>
            <span role="cell">{event.connections}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
