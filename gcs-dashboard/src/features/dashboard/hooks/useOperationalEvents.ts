import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DASHBOARD_QUERY_KEYS } from "../../stateContracts";
import { consumeOperationalEventStream, fetchOperationalEventPage } from "../operationalEventsApi";
import type { OperationalEvent, OperationalEventFilters } from "../operationalEvents";

interface OperationalEventsState {
  events: OperationalEvent[];
  errorMessage: string | null;
  isLoading: boolean;
  lastUpdatedAt: number | null;
}

const OPERATIONAL_EVENT_HISTORY_LIMIT = 500;
const operationalEventHistoryByFilter = new Map<string, OperationalEvent[]>();

export function useOperationalEvents(
  filters: OperationalEventFilters,
  fetcher: typeof fetch = fetch,
  pollIntervalMs = 10_000,
): OperationalEventsState {
  const queryFilters = useMemo(() => ({ ...filters }), [filters]);
  const filterKey = useMemo(() => JSON.stringify(queryFilters), [queryFilters]);
  const [events, setEvents] = useState<OperationalEvent[]>(
    () => operationalEventHistoryByFilter.get(filterKey) ?? [],
  );
  const query = useQuery<OperationalEvent[]>({
    queryKey: [...DASHBOARD_QUERY_KEYS.operationalEvents, queryFilters],
    queryFn: ({ signal }) =>
      fetchOperationalEventPage(
        queryFilters,
        ((input, init) => fetcher(input, { ...init, signal })) as typeof fetch,
      ).then((page) => page.events),
    placeholderData: operationalEventHistoryByFilter.get(filterKey) ?? [],
    refetchInterval: pollIntervalMs > 0 ? pollIntervalMs : false,
  });

  useEffect(() => {
    setEvents(operationalEventHistoryByFilter.get(filterKey) ?? []);
  }, [filterKey]);

  useEffect(() => {
    if (!query.data) return;
    setEvents((current) => {
      const merged = mergeOperationalEvents(current, query.data ?? []);
      operationalEventHistoryByFilter.set(filterKey, merged);
      return merged;
    });
  }, [filterKey, query.data]);

  useEffect(() => {
    if (typeof ReadableStream === "undefined") return;
    const controller = new AbortController();
    consumeOperationalEventStream(
      queryFilters,
      {
        onEvent: (event) => {
          setEvents((current) => {
            const merged = mergeOperationalEvents(current, [event]);
            operationalEventHistoryByFilter.set(filterKey, merged);
            return merged;
          });
        },
      },
      {
        fetcher,
        signal: controller.signal,
      },
    ).catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        // Polling remains active as a degraded fallback when the stream is interrupted.
      }
    });
    return () => controller.abort();
  }, [fetcher, filterKey, queryFilters]);

  return {
    events,
    errorMessage: query.error instanceof Error ? query.error.message : null,
    isLoading: query.isLoading || query.isFetching,
    lastUpdatedAt: query.dataUpdatedAt > 0 ? query.dataUpdatedAt : null,
  };
}

function mergeOperationalEvents(
  previous: OperationalEvent[],
  incoming: OperationalEvent[],
): OperationalEvent[] {
  const byId = new Map<string, OperationalEvent>();
  for (const event of previous) {
    byId.set(event.id, event);
  }
  for (const event of incoming) {
    byId.set(event.id, event);
  }
  return Array.from(byId.values())
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
    .slice(0, OPERATIONAL_EVENT_HISTORY_LIMIT);
}
