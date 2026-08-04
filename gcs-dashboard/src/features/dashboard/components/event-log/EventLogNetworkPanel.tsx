import { EVENT_CATEGORY_LABELS } from "@dashboard/eventLogPresentation";
import type { EventCategorySummary } from "@dashboard/eventLogPresentation";
import type { OperationalEvent, OperationalEventCategory } from "@dashboard/operationalEvents";

interface EventLogNetworkPanelProps {
  categoryFilter: "all" | OperationalEventCategory;
  categoryStats: EventCategorySummary[];
  eventsCount: number;
  networkFlowEvents: OperationalEvent[];
  onCategoryFilterChange: (category: OperationalEventCategory) => void;
  onSelectEvent: (eventId: string) => void;
  peakThroughput: number;
  selectedEventId: string | null;
}

export function EventLogNetworkPanel(props: EventLogNetworkPanelProps) {
  return (
    <section className="event-log-view__chart-panel" aria-label="시간대별 네트워크 지표">
      <div className="event-log-view__panel-header">
        <h3>네트워크 흐름</h3>
        <span>최근 {props.networkFlowEvents.length}/{props.eventsCount} events</span>
      </div>
      <div className="event-log-view__chart">
        {props.networkFlowEvents.map((event, index) => {
          const timeLabel = formatNetworkFlowTime(event.occurredAt);
          const previousTimeLabel = index > 0
            ? formatNetworkFlowTime(props.networkFlowEvents[index - 1].occurredAt)
            : null;
          return (
          <button
            aria-label={`${event.source} ${event.message}`}
            className={`event-log-view__bar is-${event.severity} ${props.selectedEventId === event.id ? "is-selected" : ""}`}
            key={event.id}
            onClick={() => props.onSelectEvent(event.id)}
            type="button"
          >
            <span>{timeLabel !== previousTimeLabel ? timeLabel : ""}</span>
            <i style={{ height: `${Math.max(6, (event.throughputMbps / props.peakThroughput) * 100)}%` }} />
            <small>{event.connections}</small>
          </button>
          );
        })}
      </div>
      <div className="event-log-view__categories" aria-label="분류별 이벤트">
        {props.categoryStats.map((category) => (
          <button
            aria-label={`${EVENT_CATEGORY_LABELS[category.category]} ${category.count}`}
            aria-pressed={props.categoryFilter === category.category}
            className={props.categoryFilter === category.category ? "is-active" : ""}
            key={category.category}
            onClick={() => props.onCategoryFilterChange(category.category)}
            type="button"
          >
            <strong>{EVENT_CATEGORY_LABELS[category.category]}</strong>
            {category.count}
          </button>
        ))}
      </div>
    </section>
  );
}

export function formatNetworkFlowTime(occurredAt: string): string {
  return new Date(occurredAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}
