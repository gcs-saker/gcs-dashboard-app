import type { CSSProperties, UIEventHandler } from "react";
import { EVENT_SEVERITY_LABELS } from "@dashboard/eventLogPresentation";
import type { OperationalEvent, OperationalEventFilters } from "@dashboard/operationalEvents";
import type { VirtualListRange } from "@dashboard/hooks/useVirtualList";
import { TimelineEventRow } from "./TimelineEventRow";

interface EventLogTimelinePanelProps {
  filters: OperationalEventFilters;
  onScroll: UIEventHandler<HTMLElement>;
  onSelectEvent: (eventId: string) => void;
  range: VirtualListRange;
  selectedEventId: string | null;
  timelineContainerRef: (element: HTMLElement | null) => void;
  visibleEvents: OperationalEvent[];
}

export function EventLogTimelinePanel({
  filters,
  onScroll,
  onSelectEvent,
  range,
  selectedEventId,
  timelineContainerRef,
  visibleEvents,
}: EventLogTimelinePanelProps) {
  return (
    <section className="event-log-view__timeline" aria-label="운영 이벤트 타임라인">
      <div className="event-log-view__panel-header">
        <h3>운영 이벤트 타임라인</h3>
        <span>{filters.severity === "all" ? "전체 강도" : EVENT_SEVERITY_LABELS[filters.severity]}</span>
      </div>
      <div
        className="event-log-view__list"
        onScroll={onScroll}
        ref={timelineContainerRef}
        role="listbox"
        style={{ "--virtual-list-height": `${range.totalHeight}px` } as CSSProperties}
      >
        <div className="event-log-view__virtual-spacer">
          <div className="event-log-view__virtual-window" style={{ transform: `translateY(${range.offsetTop}px)` }}>
            {visibleEvents.map((event) => (
              <TimelineEventRow event={event} isSelected={selectedEventId === event.id} key={event.id} onSelect={onSelectEvent} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
