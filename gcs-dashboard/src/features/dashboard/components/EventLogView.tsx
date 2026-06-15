import { useEffect, useMemo, useState } from "react";
import {
  summarizeOperationalEvents,
  type OperationalEvent,
  type OperationalEventCategory,
  type OperationalEventFilters,
} from "../operationalEvents";
import { useOperationalEvents } from "../hooks/useOperationalEvents";

const severityLabels = {
  all: "전체",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
} as const;

const categoryLabels: Record<OperationalEventCategory, string> = {
  api: "API",
  signaling: "Signaling",
  network: "Network",
  stream: "Stream",
  security: "Security",
};

const eventCategories: OperationalEventCategory[] = ["api", "signaling", "network", "stream", "security"];

export function EventLogView() {
  const [filters, setFilters] = useState<OperationalEventFilters>({
    query: "",
    severity: "all",
    from: "",
    to: "",
  });
  const [categoryFilter, setCategoryFilter] = useState<"all" | OperationalEventCategory>("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const { events: rawEvents, errorMessage, isLoading, lastUpdatedAt } = useOperationalEvents(filters);
  const events = useMemo(
    () =>
      rawEvents.filter((event) => {
        const matchesCategory = categoryFilter === "all" || event.category === categoryFilter;
        const matchesSource = sourceFilter === "all" || event.source === sourceFilter;
        return matchesCategory && matchesSource;
      }),
    [categoryFilter, rawEvents, sourceFilter],
  );
  const summary = useMemo(() => summarizeOperationalEvents(events), [events]);
  const peakThroughput = Math.max(1, summary.peakThroughputMbps);
  const categoryStats = useMemo(() => summarizeCategories(events), [events]);
  const sourceOptions = useMemo(() => Array.from(new Set(rawEvents.map((event) => event.source))).sort(), [rawEvents]);
  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? events[0] ?? null,
    [events, selectedEventId],
  );
  const activeFilterText = useMemo(
    () => [
      filters.severity !== "all" ? severityLabels[filters.severity] : null,
      categoryFilter !== "all" ? categoryLabels[categoryFilter] : null,
      sourceFilter !== "all" ? sourceFilter : null,
      filters.query ? `"${filters.query}"` : null,
      filters.from || filters.to ? "기간 지정" : null,
    ].filter(Boolean).join(" · ") || "전체 이벤트",
    [categoryFilter, filters.from, filters.query, filters.severity, filters.to, sourceFilter],
  );

  const resetFilters = (): void => {
    setFilters({ query: "", severity: "all", from: "", to: "" });
    setCategoryFilter("all");
    setSourceFilter("all");
  };

  useEffect(() => {
    if (!selectedEventId && events[0]) {
      setSelectedEventId(events[0].id);
      return;
    }
    if (selectedEventId && events.every((event) => event.id !== selectedEventId)) {
      setSelectedEventId(events[0]?.id ?? null);
    }
  }, [events, selectedEventId]);

  return (
    <section className="event-log-view" aria-label="이벤트로그">
      <header className="event-log-view__hero">
        <div>
          <span>Operations Event Center</span>
          <h2>이벤트 로그</h2>
          <p>스트리밍, 인증, 네트워크, 보안 이벤트를 시간 흐름과 운영 지표로 함께 확인합니다.</p>
        </div>
        <div className="event-log-view__sync">
          {isLoading ? <span role="status">이벤트 갱신 중</span> : <span>감시 중</span>}
          {lastUpdatedAt ? <strong>{new Date(lastUpdatedAt).toLocaleTimeString("ko-KR")} 갱신</strong> : <strong>초기화 중</strong>}
        </div>
      </header>

      <div className="event-log-view__summary" aria-label="운영 지표 요약">
        <MetricCard label="연결 합계" value={summary.connections.toLocaleString("ko-KR")} tone="info" />
        <MetricCard label="평균 RTT" value={`${summary.avgLatencyMs} ms`} tone={summary.avgLatencyMs > 120 ? "warning" : "good"} />
        <MetricCard label="Peak Throughput" value={`${summary.peakThroughputMbps.toFixed(1)} Mbps`} tone="info" />
        <MetricCard label="WARN" value={String(summary.warnings)} tone={summary.warnings > 0 ? "warning" : "muted"} />
        <MetricCard label="ERROR" value={String(summary.errors)} tone={summary.errors > 0 ? "danger" : "muted"} />
      </div>

      <div className="event-log-view__quickbar" aria-label="빠른 이벤트 필터">
        <div>
          <span>빠른 필터</span>
          {(["all", "warn", "error"] as const).map((severity) => (
            <button
              aria-pressed={filters.severity === severity}
              className={filters.severity === severity ? "is-active" : ""}
              key={severity}
              onClick={() => setFilters((current) => ({ ...current, severity }))}
              type="button"
            >
              {severityLabels[severity]}
            </button>
          ))}
        </div>
        <strong>{activeFilterText}</strong>
        <button onClick={resetFilters} type="button">초기화</button>
      </div>

      <div className="event-log-view__filters">
        <label>
          <span>내용 / 출처 / 분류</span>
          <input
            aria-label="내용"
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
            placeholder="검색어 입력"
            value={filters.query}
          />
        </label>
        <label>
          <span>강도</span>
          <select
            aria-label="강도"
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
          <span>분류</span>
          <select
            aria-label="분류"
            onChange={(event) => setCategoryFilter(event.target.value as "all" | OperationalEventCategory)}
            value={categoryFilter}
          >
            <option value="all">전체</option>
            {Object.entries(categoryLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>서버</span>
          <select aria-label="서버" onChange={(event) => setSourceFilter(event.target.value)} value={sourceFilter}>
            <option value="all">전체</option>
            {sourceOptions.map((source) => (
              <option key={source} value={source}>
                {source}
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

      {errorMessage ? <p className="event-log-view__error" role="alert">{errorMessage}</p> : null}

      <div className="event-log-view__workspace">
        <section className="event-log-view__chart-panel" aria-label="시간대별 네트워크 지표">
          <div className="event-log-view__panel-header">
            <h3>네트워크 흐름</h3>
            <span>{events.length} events</span>
          </div>
          <div className="event-log-view__chart">
            {events.map((event) => (
              <button
                aria-label={`${event.source} ${event.message}`}
                className={`event-log-view__bar is-${event.severity} ${selectedEvent?.id === event.id ? "is-selected" : ""}`}
                key={event.id}
                onClick={() => setSelectedEventId(event.id)}
                type="button"
              >
                <span>{new Date(event.occurredAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>
                <i style={{ height: `${Math.max(6, (event.throughputMbps / peakThroughput) * 100)}%` }} />
                <small>{event.connections}</small>
              </button>
            ))}
          </div>
          <div className="event-log-view__categories" aria-label="분류별 이벤트">
            {categoryStats.map((category) => (
              <button
                aria-pressed={categoryFilter === category.category}
                className={categoryFilter === category.category ? "is-active" : ""}
                key={category.category}
                onClick={() => setCategoryFilter(category.category)}
                type="button"
              >
                <strong>{categoryLabels[category.category]}</strong>
                {category.count}
              </button>
            ))}
          </div>
        </section>

        <section className="event-log-view__timeline" aria-label="운영 이벤트 타임라인">
          <div className="event-log-view__panel-header">
            <h3>운영 이벤트 타임라인</h3>
            <span>{filters.severity === "all" ? "전체 강도" : severityLabels[filters.severity]}</span>
          </div>
          <div className="event-log-view__list">
            {events.map((event) => (
              <button
                className={`event-log-item is-${event.severity} ${selectedEvent?.id === event.id ? "is-selected" : ""}`}
                key={event.id}
                onClick={() => setSelectedEventId(event.id)}
                type="button"
              >
                <span>{new Date(event.occurredAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                <strong>{event.source}</strong>
                <em>{event.severity.toUpperCase()}</em>
                <p>{event.message}</p>
                <small>{categoryLabels[event.category]} · RTT {event.latencyMs} ms · 연결 {event.connections}</small>
              </button>
            ))}
          </div>
        </section>

        <aside className="event-log-view__detail" aria-label="이벤트 상세">
          <div className="event-log-view__panel-header">
            <h3>이벤트 상세</h3>
            {selectedEvent ? <span className={`event-log-severity is-${selectedEvent.severity}`}>{selectedEvent.severity.toUpperCase()}</span> : null}
          </div>
          {selectedEvent ? (
            <>
              <strong>{selectedEvent.message}</strong>
              <div className="event-log-view__detail-actions">
                <button onClick={() => setSourceFilter(selectedEvent.source)} type="button">이 서버만 보기</button>
                <button onClick={() => setCategoryFilter(selectedEvent.category)} type="button">이 분류만 보기</button>
              </div>
              <div className="event-log-view__diagnosis">
                <section>
                  <span>원인 후보</span>
                  <p>{diagnoseCause(selectedEvent)}</p>
                </section>
                <section>
                  <span>영향 범위</span>
                  <p>{diagnoseImpact(selectedEvent)}</p>
                </section>
                <section>
                  <span>권장 조치</span>
                  <p>{diagnoseAction(selectedEvent)}</p>
                </section>
              </div>
              <dl>
                <div>
                  <dt>시간</dt>
                  <dd>{new Date(selectedEvent.occurredAt).toLocaleString("ko-KR")}</dd>
                </div>
                <div>
                  <dt>출처</dt>
                  <dd>{selectedEvent.source}</dd>
                </div>
                <div>
                  <dt>분류</dt>
                  <dd>{categoryLabels[selectedEvent.category]}</dd>
                </div>
                <div>
                  <dt>연결</dt>
                  <dd>{selectedEvent.connections}</dd>
                </div>
                <div>
                  <dt>RTT</dt>
                  <dd>{selectedEvent.latencyMs} ms</dd>
                </div>
                <div>
                  <dt>처리량</dt>
                  <dd>{selectedEvent.throughputMbps.toFixed(1)} Mbps</dd>
                </div>
              </dl>
              <section className="event-log-view__raw" aria-label="운영 이벤트 원문">
                <span>운영 이벤트 원문</span>
                <pre>{formatOperationalEventPayload(selectedEvent)}</pre>
              </section>
            </>
          ) : (
            <p>표시할 이벤트가 없습니다.</p>
          )}
        </aside>
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "warning" | "danger" | "muted" | "info";
}) {
  return (
    <span className={`event-log-metric is-${tone}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function summarizeCategories(events: OperationalEvent[]): Array<{ category: OperationalEventCategory; count: number }> {
  const counts = new Map<OperationalEventCategory, number>(eventCategories.map((category) => [category, 0]));
  for (const event of events) {
    counts.set(event.category, (counts.get(event.category) ?? 0) + 1);
  }
  return eventCategories.map((category) => ({ category, count: counts.get(category) ?? 0 }));
}

function diagnoseCause(event: OperationalEvent): string {
  if (event.category === "security") return "세션 만료, 권한 정책, 토큰 갱신 실패 가능성이 큽니다.";
  if (event.category === "network") return "NAT 경로, TURN fallback, 네트워크 지연 또는 패킷 손실을 우선 확인해야 합니다.";
  if (event.category === "signaling") return "WHEP/WHIP signaling 응답, ICE 후보 수집, 인증 헤더 누락 가능성을 확인해야 합니다.";
  if (event.category === "stream") return "송출 장치 상태, MediaMTX path, 코덱/트랙 상태를 점검해야 합니다.";
  return "API health, ready 상태, DB/Redis 의존 서비스 응답을 확인해야 합니다.";
}

function diagnoseImpact(event: OperationalEvent): string {
  if (event.severity === "error") return "사용자 기능 실패 또는 스트림 접근 실패로 이어질 수 있습니다.";
  if (event.severity === "warn") return "서비스는 유지되지만 지연, fallback, 일부 기능 저하가 발생할 수 있습니다.";
  return "현재는 참고 이벤트이며 운영 추세 확인에 사용합니다.";
}

function diagnoseAction(event: OperationalEvent): string {
  if (event.category === "security") return "사용자 세션 상태와 인증 서버 로그를 확인하고 필요 시 재로그인을 안내합니다.";
  if (event.category === "network") return "ICE 후보 유형, TURN 사용률, RTT 변화를 확인하고 포트/방화벽 정책을 점검합니다.";
  if (event.category === "signaling") return "signaling 서버 health와 WHEP/WHIP route 응답 코드를 확인합니다.";
  if (event.category === "stream") return "송출자 상태, stream path, MediaMTX 로그를 확인합니다.";
  return "해당 서비스 health와 최근 배포/재시작 이력을 확인합니다.";
}

function formatOperationalEventPayload(event: OperationalEvent): string {
  return [
    `id=${event.id}`,
    `occurredAt=${event.occurredAt}`,
    `severity=${event.severity}`,
    `category=${event.category}`,
    `source=${event.source}`,
    `message=${event.message}`,
    `connections=${event.connections}`,
    `latencyMs=${event.latencyMs}`,
    `throughputMbps=${event.throughputMbps.toFixed(1)}`,
  ].join("\n");
}
