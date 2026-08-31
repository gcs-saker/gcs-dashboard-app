import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DASHBOARD_QUERY_KEY_FACTORY } from "@features/stateContracts";
import {
  DASHBOARD_QUERY_POLICY,
  withAbortSignal,
} from "@features/queryClient";
import { fetchOperationalEventPage } from "@dashboard/operations/operationalEventsApi";
import type { OperationalEvent, OperationalEventFilters } from "@dashboard/operations/operationalEvents";
import {
  readOperationalEventHistory,
  rememberOperationalEventHistory,
} from "@dashboard/operations/operationalEventHistory";
import { useOperationalEventSubscription } from "./useOperationalEventSubscription";
export { resetOperationalEventHistory } from "@dashboard/operations/operationalEventHistory";

interface OperationalEventsState {
  events: OperationalEvent[];
  errorMessage: string | null;
  isLoading: boolean;
  lastUpdatedAt: number | null;
}

const EMPTY_EVENTS: OperationalEvent[] = [];


export function useOperationalEvents(
  sessionScope: string,
  filters: OperationalEventFilters,
  fetcher: typeof fetch = fetch,
): OperationalEventsState {
  const filterKey = useMemo(() => JSON.stringify([sessionScope, filters]), [filters, sessionScope]);
  const queryFilters = useMemo(() => ({ ...filters }), [filters]);
  const [events, setEvents] = useState<OperationalEvent[]>(
    () => readOperationalEventHistory(filterKey),
  );
  const query = useQuery({
    queryKey: DASHBOARD_QUERY_KEY_FACTORY.operationalEvents(sessionScope, queryFilters),
    queryFn: ({ signal }) =>
      fetchOperationalEventPage(
        queryFilters,
        withAbortSignal(fetcher, signal),
      ),
    placeholderData: { events: readOperationalEventHistory(filterKey), nextCursor: null },
    staleTime: DASHBOARD_QUERY_POLICY.operationsStaleTimeMs,
  });

  useEffect(() => {
    setEvents(readOperationalEventHistory(filterKey));
  }, [filterKey]);

  useEffect(() => {
    if (!query.data) return;
    rememberOperationalEventHistory(filterKey, query.data.events);
    setEvents(query.data.events);
  }, [filterKey, query.data]);

  useOperationalEventSubscription({
    enabled: query.isSuccess,
    filters: queryFilters,
    fetcher,
    filterKey,
    initialEvents: query.data?.events ?? EMPTY_EVENTS,
    setEvents,
  });

  return {
    events,
    errorMessage: query.error instanceof Error ? query.error.message : null,
    isLoading: query.isLoading || query.isFetching,
    lastUpdatedAt: query.dataUpdatedAt > 0 ? query.dataUpdatedAt : null,
  };
}
