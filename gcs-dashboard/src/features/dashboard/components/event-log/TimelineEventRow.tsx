import { memo } from "react";

import { EVENT_CATEGORY_LABELS } from "@dashboard/operations/eventLogPresentation";
import type { OperationalEvent } from "@dashboard/operations/operationalEvents";

interface TimelineEventRowProps {
  event: OperationalEvent;
  isSelected: boolean;
  onSelect: (eventId: string) => void;
}

export const TimelineEventRow = memo(function TimelineEventRow({
  event,
  isSelected,
  onSelect,
}: TimelineEventRowProps) {
  return (
    <button
      aria-selected={isSelected}
      className={`event-log-item is-${event.severity} ${isSelected ? "is-selected" : ""}`}
      onClick={() => onSelect(event.id)}
      role="option"
      type="button"
    >
      <span>{new Date(event.occurredAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
      <strong>{event.source}</strong>
      <em>{event.severity.toUpperCase()}</em>
      <p>{event.message}</p>
      <small>{EVENT_CATEGORY_LABELS[event.category]} · RTT {event.latencyMs} ms · 연결 {event.connections}</small>
    </button>
  );
});
