import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { DASHBOARD_QUERY_KEY_FACTORY } from "@features/stateContracts";
import {
  dashboardRefetchInterval,
  DASHBOARD_QUERY_POLICY,
  withAbortSignal,
} from "@features/queryClient";
import { consumeOperationalEventStream, fetchOperationalEventPage } from "@dashboard/operations/operationalEventsApi";
import type { OperationalEvent, OperationalEventFilters } from "@dashboard/operations/operationalEvents";
import {
  mergeOperationalEvents,
  readOperationalEventHistory,
  rememberOperationalEventHistory,
} from "@dashboard/operations/operationalEventHistory";
export { resetOperationalEventHistory } from "@dashboard/operations/operationalEventHistory";

interface OperationalEventsState {
  events: OperationalEvent[];
  errorMessage: string | null;
  isLoading: boolean;
  lastUpdatedAt: number | null;
}


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

  useOperationalEventSubscription({ filters: queryFilters, fetcher, filterKey, setEvents });

  return {
    events,
    errorMessage: query.error instanceof Error ? query.error.message : null,
    isLoading: query.isLoading || query.isFetching,
    lastUpdatedAt: query.dataUpdatedAt > 0 ? query.dataUpdatedAt : null,
  };
}

interface OperationalEventSubscriptionInput {
  filters: OperationalEventFilters;
  fetcher: typeof fetch;
  filterKey: string;
  setEvents: Dispatch<SetStateAction<OperationalEvent[]>>;
}

function useOperationalEventSubscription(input: OperationalEventSubscriptionInput): void {
  const { fetcher, filterKey, filters, setEvents } = input;
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
    ).catch(() => undefined);
    return () => controller.abort();
  }, [fetcher, filterKey, filters, setEvents]);
}
