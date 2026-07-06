import {
  summarizeOperationalEventMetrics,
  summarizeOperationalEvents,
  type OperationalEvent,
  type OperationalEventCategory,
  type OperationalEventFilters,
  type OperationalEventMetrics,
  type OperationalEventSummary,
} from "./operationalEvents";
import {
  EVENT_CATEGORY_LABELS,
  EVENT_SEVERITY_LABELS,
  summarizeEventCategories,
  type EventCategorySummary,
} from "./eventLogPresentation";

const NETWORK_FLOW_EVENT_LIMIT = 24;
const CURRENT_INCIDENT_LIMIT = 3;

export interface EventLogViewModelInput {
  rawEvents: OperationalEvent[];
  filters: OperationalEventFilters;
  categoryFilter: "all" | OperationalEventCategory;
  sourceFilter: string;
  selectedEventId: string | null;
  metrics: OperationalEventMetrics | null;
}

export interface EventLogViewModel {
  activeFilterText: string;
  canUseServerMetrics: boolean;
  categoryStats: EventCategorySummary[];
  currentIncidents: OperationalEvent[];
  directCandidateCount: number;
  events: OperationalEvent[];
  networkFlowEvents: OperationalEvent[];
  peakThroughput: number;
  relayCount: number;
  selectedEvent: OperationalEvent | null;
  sourceOptions: string[];
  streamSessionCount: number;
  summary: OperationalEventSummary;
  throughputLabel: "Avg Throughput" | "Peak Throughput";
}

export function buildEventLogViewModel(input: EventLogViewModelInput): EventLogViewModel {
  const events = filterByClientFacets(input.rawEvents, input.categoryFilter, input.sourceFilter);
  const canUseServerMetrics = input.categoryFilter === "all" && input.sourceFilter === "all" && input.metrics !== null;
  const summary = canUseServerMetrics && input.metrics
    ? summarizeOperationalEventMetrics(input.metrics)
    : summarizeOperationalEvents(events);

  return {
    activeFilterText: activeFilterText(input.filters, input.categoryFilter, input.sourceFilter),
    canUseServerMetrics,
    categoryStats: summarizeEventCategories(events),
    currentIncidents: events
      .filter((event) => event.severity === "error" || event.severity === "warn")
      .slice(0, CURRENT_INCIDENT_LIMIT),
    directCandidateCount: icePathCount(input.metrics, ["host", "srflx"]),
    events,
    networkFlowEvents: events.slice(0, NETWORK_FLOW_EVENT_LIMIT).reverse(),
    peakThroughput: Math.max(1, summary.peakThroughputMbps),
    relayCount: icePathCount(input.metrics, ["relay"]),
    selectedEvent: events.find((event) => event.id === input.selectedEventId) ?? events[0] ?? null,
    sourceOptions: Array.from(new Set(input.rawEvents.map((event) => event.source))).sort(),
    streamSessionCount: input.metrics?.streamSessions.length ?? 0,
    summary,
    throughputLabel: canUseServerMetrics ? "Avg Throughput" : "Peak Throughput",
  };
}

function filterByClientFacets(
  events: OperationalEvent[],
  categoryFilter: "all" | OperationalEventCategory,
  sourceFilter: string,
): OperationalEvent[] {
  return events.filter((event) => {
    const matchesCategory = categoryFilter === "all" || event.category === categoryFilter;
    const matchesSource = sourceFilter === "all" || event.source === sourceFilter;
    return matchesCategory && matchesSource;
  });
}

function icePathCount(metrics: OperationalEventMetrics | null, paths: readonly string[]): number {
  return metrics?.icePathCounts
    .filter((item) => paths.includes(item.icePath))
    .reduce((total, item) => total + item.count, 0) ?? 0;
}

function activeFilterText(
  filters: OperationalEventFilters,
  categoryFilter: "all" | OperationalEventCategory,
  sourceFilter: string,
): string {
  return [
    filters.severity !== "all" ? EVENT_SEVERITY_LABELS[filters.severity] : null,
    categoryFilter !== "all" ? EVENT_CATEGORY_LABELS[categoryFilter] : null,
    sourceFilter !== "all" ? sourceFilter : null,
    filters.query ? `"${filters.query}"` : null,
    filters.from || filters.to ? "기간 지정" : null,
  ].filter(Boolean).join(" · ") || "전체 이벤트";
}
