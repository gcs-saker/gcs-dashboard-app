import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { DASHBOARD_QUERY_KEY_FACTORY } from "@features/stateContracts";
import { registerSessionScopedCache } from "@features/sessionScopedCache";
import {
  dashboardRefetchInterval,
  DASHBOARD_QUERY_POLICY,
  withAbortSignal,
} from "@features/queryClient";
import { consumeOperationalEventStream, fetchOperationalEventPage } from "@dashboard/operations/operationalEventsApi";
import type { OperationalEvent, OperationalEventFilters } from "@dashboard/operations/operationalEvents";

interface OperationalEventsState {
  events: OperationalEvent[];
  errorMessage: string | null;
  isLoading: boolean;
  lastUpdatedAt: number | null;
}

const OPERATIONAL_EVENT_HISTORY_LIMIT = 500;
const OPERATIONAL_EVENT_FILTER_HISTORY_LIMIT = 20;
const operationalEventHistoryByFilter = new Map<string, OperationalEvent[]>();

export function useOperationalEvents(
  sessionScope: string,
  filters: OperationalEventFilters,
  fetcher: typeof fetch = fetch,
  pollIntervalMs = DASHBOARD_QUERY_POLICY.operationsRefetchMs,
): OperationalEventsState {
  const filterKey = useMemo(() => JSON.stringify([sessionScope, filters]), [filters, sessionScope]);
  const queryFilters = useMemo(() => ({ ...filters }), [filters]);
  const [events, setEvents] = useState<OperationalEvent[]>(
    () => readOperationalEventHistory(filterKey),
  );
  const query = useQuery<OperationalEvent[]>({
    queryKey: DASHBOARD_QUERY_KEY_FACTORY.operationalEvents(sessionScope, queryFilters),
    queryFn: ({ signal }) =>
      fetchOperationalEventPage(
        queryFilters,
        withAbortSignal(fetcher, signal),
      ).then((page) => page.events),
    placeholderData: readOperationalEventHistory(filterKey),
    refetchInterval: dashboardRefetchInterval(pollIntervalMs),
    staleTime: DASHBOARD_QUERY_POLICY.operationsStaleTimeMs,
  });

  useEffect(() => {
    setEvents(readOperationalEventHistory(filterKey));
  }, [filterKey]);

  useEffect(() => {
    if (!query.data) return;
    setEvents((current) => {
      const merged = mergeOperationalEvents(current, query.data ?? []);
      rememberOperationalEventHistory(filterKey, merged);
      return merged;
    });
  }, [filterKey, query.data]);

  useOperationalEventSubscription(queryFilters, fetcher, filterKey, setEvents);

  return {
    events,
    errorMessage: query.error instanceof Error ? query.error.message : null,
    isLoading: query.isLoading || query.isFetching,
    lastUpdatedAt: query.dataUpdatedAt > 0 ? query.dataUpdatedAt : null,
  };
}

function useOperationalEventSubscription(
  filters: OperationalEventFilters,
  fetcher: typeof fetch,
  filterKey: string,
  setEvents: Dispatch<SetStateAction<OperationalEvent[]>>,
): void {
  useEffect(() => {
    if (typeof ReadableStream === "undefined") return undefined;
    const controller = new AbortController();
    consumeOperationalEventStream(
      filters,
      {
        onEvent: (event) => {
          setEvents((current) => {
            const merged = mergeOperationalEvents(current, [event]);
            rememberOperationalEventHistory(filterKey, merged);
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
  }, [fetcher, filterKey, filters, setEvents]);
}

export function resetOperationalEventHistory(): void {
  operationalEventHistoryByFilter.clear();
}

registerSessionScopedCache(resetOperationalEventHistory);

function readOperationalEventHistory(filterKey: string): OperationalEvent[] {
  const cached = operationalEventHistoryByFilter.get(filterKey);
  if (!cached) return [];
  operationalEventHistoryByFilter.delete(filterKey);
  operationalEventHistoryByFilter.set(filterKey, cached);
  return cached;
}

function rememberOperationalEventHistory(filterKey: string, events: OperationalEvent[]): void {
  if (operationalEventHistoryByFilter.has(filterKey)) {
    operationalEventHistoryByFilter.delete(filterKey);
  }
  operationalEventHistoryByFilter.set(filterKey, events);
  while (operationalEventHistoryByFilter.size > OPERATIONAL_EVENT_FILTER_HISTORY_LIMIT) {
    const oldestKey = operationalEventHistoryByFilter.keys().next().value;
    if (typeof oldestKey !== "string") break;
    operationalEventHistoryByFilter.delete(oldestKey);
  }
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
    // oxlint-disable-next-line unicorn/no-array-sort -- The ES2022 browser target requires sorting an owned copy.
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
    .slice(0, OPERATIONAL_EVENT_HISTORY_LIMIT);
}
