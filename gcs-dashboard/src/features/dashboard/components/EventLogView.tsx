import { useEffect, useMemo } from "react";
import { useAuth } from "@auth/AuthProvider";
import { RENDER_DIAGNOSTIC_LABELS, useRenderDiagnostics } from "@/features/renderDiagnostics";
import { buildEventLogViewModel } from "@dashboard/operations/eventLogViewModel";
import { useOperationalEventMetrics } from "@dashboard/hooks/operations/useOperationalEventMetrics";
import { useOperationalEvents } from "@dashboard/hooks/operations/useOperationalEvents";
import { useVirtualList } from "@/features/shared/hooks/useVirtualList";
import { useEventLogActions, useEventLogFilterState } from "@dashboard/stores/useEventLogStore";
import { EventLogDetailPanel } from "./event-log/EventLogDetailPanel";
import { EventLogFilters } from "./event-log/EventLogFilters";
import { EventLogHero } from "./event-log/EventLogHero";
import { EventLogIncidentStrip } from "./event-log/EventLogIncidentStrip";
import { EventLogNetworkPanel } from "./event-log/EventLogNetworkPanel";
import { EventLogQuickFilters } from "./event-log/EventLogQuickFilters";
import { EventLogSummaryStrip } from "./event-log/EventLogSummaryStrip";
import { EventLogTimelinePanel } from "./event-log/EventLogTimelinePanel";

const EVENT_ROW_HEIGHT_PX = 96;

export function EventLogView() {
  useRenderDiagnostics(RENDER_DIAGNOSTIC_LABELS.eventLogView);
  const { currentUser } = useAuth();
  const sessionScope = currentUser?.username ?? "anonymous";
  const { categoryFilter, filters, selectedEventId, sourceFilter } = useEventLogFilterState();
  const { patchFilters, resetFilters, setCategoryFilter, setSelectedEventId, setSourceFilter } = useEventLogActions();
  const { events: rawEvents, errorMessage, isLoading, lastUpdatedAt } = useOperationalEvents(sessionScope, filters);
  const eventMetrics = useOperationalEventMetrics(sessionScope, filters);
  const viewModel = useMemo(
    () => buildEventLogViewModel({
      rawEvents,
      filters,
      categoryFilter,
      sourceFilter,
      selectedEventId,
      metrics: eventMetrics.metrics,
    }),
    [categoryFilter, eventMetrics.metrics, filters, rawEvents, selectedEventId, sourceFilter],
  );
  const { containerRef, onScroll, range } = useVirtualList({
    itemCount: viewModel.events.length,
    itemHeight: EVENT_ROW_HEIGHT_PX,
    overscan: 5,
  });
  const visibleTimelineEvents = useMemo(
    () => viewModel.events.slice(range.startIndex, range.endIndex),
    [range.endIndex, range.startIndex, viewModel.events],
  );
  const mergedLastUpdatedAt = latestTimestamp(lastUpdatedAt, eventMetrics.lastUpdatedAt);

  useEffect(() => {
    if (!selectedEventId && viewModel.events[0]) {
      setSelectedEventId(viewModel.events[0].id);
      return;
    }
    if (selectedEventId && viewModel.events.every((event) => event.id !== selectedEventId)) {
      setSelectedEventId(viewModel.events[0]?.id ?? null);
    }
  }, [selectedEventId, setSelectedEventId, viewModel.events]);

  return (
    <section className="event-log-view" aria-label="이벤트로그">
      <EventLogHero isLoading={isLoading || eventMetrics.isLoading} lastUpdatedAt={mergedLastUpdatedAt} />
      <EventLogSummaryStrip
        directCandidateCount={viewModel.directCandidateCount}
        relayCount={viewModel.relayCount}
        streamSessionCount={viewModel.streamSessionCount}
        summary={viewModel.summary}
        throughputLabel={viewModel.throughputLabel}
      />
      <EventLogIncidentStrip incidents={viewModel.currentIncidents} />
      <EventLogQuickFilters activeFilterText={viewModel.activeFilterText} filters={filters} onPatchFilters={patchFilters} onResetFilters={resetFilters} />
      <EventLogFilters
        categoryFilter={categoryFilter}
        filters={filters}
        onCategoryFilterChange={setCategoryFilter}
        onPatchFilters={patchFilters}
        onSourceFilterChange={setSourceFilter}
        sourceFilter={sourceFilter}
        sourceOptions={viewModel.sourceOptions}
      />
      {errorMessage || eventMetrics.errorMessage ? (
        <p className="event-log-view__error" role="alert">{errorMessage ?? eventMetrics.errorMessage}</p>
      ) : null}
      <div className="event-log-view__workspace">
        <EventLogNetworkPanel
          categoryFilter={categoryFilter}
          categoryStats={viewModel.categoryStats}
          eventsCount={viewModel.events.length}
          networkFlowEvents={viewModel.networkFlowEvents}
          onCategoryFilterChange={setCategoryFilter}
          onSelectEvent={setSelectedEventId}
          peakThroughput={viewModel.peakThroughput}
          selectedEventId={viewModel.selectedEvent?.id ?? null}
        />
        <EventLogTimelinePanel
          filters={filters}
          onScroll={onScroll}
          onSelectEvent={setSelectedEventId}
          range={range}
          selectedEventId={viewModel.selectedEvent?.id ?? null}
          timelineContainerRef={containerRef}
          visibleEvents={visibleTimelineEvents}
        />
        <EventLogDetailPanel event={viewModel.selectedEvent} onCategoryFilterChange={setCategoryFilter} onSourceFilterChange={setSourceFilter} />
      </div>
    </section>
  );
}

function latestTimestamp(first: number | null, second: number | null): number | null {
  if (first === null && second === null) return null;
  return Math.max(first ?? 0, second ?? 0);
}
